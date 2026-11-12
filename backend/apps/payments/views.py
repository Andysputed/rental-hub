import re
from decimal import Decimal
from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from django.db.models import Sum
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from django.conf import settings as django_settings
from .models import Payment, PaymentAllocation, Deposit, DepositDeduction
from .serializers import (
    PaymentSerializer,
    RecordPaymentSerializer,
    DepositSerializer,
    DepositSettlementSerializer,
    RecordDepositPaymentSerializer,
    PaymentReversalSerializer,
    PaymentRefundRequestSerializer,
    ReservationReleaseSerializer,
)
from apps.properties.services import get_active_property_id
from .services import record_deposit_payment
from .ledger import payment_available_credit, reverse_payment, create_payment_refund
from .models import PaymentRefund, PaymentReversal


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        active_prop_id = get_active_property_id()
        qs = Payment.objects.all().select_related('tenant', 'tenancy', 'room', 'charge').prefetch_related('allocations__charge', 'reservations', 'refunds')
        if active_prop_id:
            qs = qs.filter(room__property_id=active_prop_id)

        method = self.request.query_params.get('method')
        if method in ('mpesa', 'cash', 'bank'):
            qs = qs.filter(method=method)

        room_id = self.request.query_params.get('roomId')
        if room_id:
            qs = qs.filter(room_id=room_id)

        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        tenancy_id = self.request.query_params.get('tenancyId')
        if tenancy_id:
            qs = qs.filter(tenancy_id=tenancy_id)

        month = self.request.query_params.get('month')
        if month and re.match(r'^\d{4}-(0[1-9]|1[0-2])$', month):
            year, month_num = month.split('-')
            qs = qs.filter(date__year=int(year), date__month=int(month_num))

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(reference__icontains=search) |
                Q(receipt_number__icontains=search) |
                Q(tenant__full_name__icontains=search)
            )

        return qs.order_by('-date', '-created_at')

    def create(self, request, *args, **kwargs):
        serializer = RecordPaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = serializer.save()
        except IntegrityError:
            if Payment.objects.filter(reference=request.data.get('reference', '').strip()).exists():
                return Response({"reference": "This transaction reference has already been recorded."}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": "Payment could not be recorded because a financial integrity constraint was violated."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='receipt')
    def receipt(self, request, pk=None):
        payment = self.get_object()
        charge = payment.charge
        room = payment.room
        prop = room.property
        settings = getattr(prop, 'settings', None)

        receipt_allocations = list(payment.allocations.select_related('charge').order_by('created_at', 'id'))

        def allocation_snapshot(allocation):
            allocated_before = PaymentAllocation.objects.filter(
                charge=allocation.charge,
            ).filter(
                Q(created_at__lt=allocation.created_at) |
                Q(created_at=allocation.created_at, id__lt=allocation.id)
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            deducted_before = DepositDeduction.objects.filter(
                charge=allocation.charge,
                created_at__lt=allocation.created_at,
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            before = max(Decimal('0.00'), allocation.charge.amount - allocated_before - deducted_before)
            after = max(Decimal('0.00'), before - allocation.amount)
            return {
                'chargeId': allocation.charge_id,
                'month': allocation.charge.month,
                'chargeAmount': float(allocation.charge.amount),
                'amount': float(allocation.amount),
                'balanceBefore': float(before),
                'balanceAfter': float(after),
            }

        allocation_details = [allocation_snapshot(item) for item in receipt_allocations]
        primary_allocation = next(
            (item for item in allocation_details if charge and item['chargeId'] == charge.id),
            allocation_details[0] if allocation_details else None,
        )
        charge_total = charge.amount if charge else payment.amount
        balance_after = Decimal(str(primary_allocation['balanceAfter'])) if primary_allocation else Decimal('0.00')
        balance_before = Decimal(str(primary_allocation['balanceBefore'])) if primary_allocation else payment.amount

        # Formatted receipt payload
        receipt_data = {
            'id': payment.id,
            'receiptNumber': payment.receipt_number,
            'date': str(payment.date),
            'amount': float(payment.amount),
            'method': payment.method,
            'reference': payment.reference,
            'notes': payment.notes,
            'tenant': {
                'id': payment.tenant.id,
                'fullName': payment.tenant.full_name,
                'phone': payment.tenant.phone,
                'email': payment.tenant.email,
            },
            'room': {
                'id': room.id,
                'name': room.name,
                'number': room.number,
            },
            'property': {
                'name': prop.name,
                'location': prop.location,
                'currency': prop.currency,
                'landlordName': settings.landlord_name if settings else 'Landlord',
                'landlordInitials': settings.landlord_initials if settings else 'LL',
            },
            'allocation': {
                'chargeId': primary_allocation['chargeId'] if primary_allocation else (charge.id if charge else None),
                'month': primary_allocation['month'] if primary_allocation else (charge.month if charge else None),
                'chargeAmount': float(charge_total),
                'balanceBefore': float(balance_before),
                'balanceAfter': float(balance_after),
                'amount': primary_allocation['amount'] if primary_allocation else float(payment.amount),
            },
            'allocations': allocation_details,
            'reservations': [
                {'id': reservation.id, 'month': reservation.month, 'amount': float(reservation.amount),
                 'remainingAmount': float(reservation.remaining_amount), 'status': reservation.status}
                for reservation in payment.reservations.order_by('month', 'created_at', 'id')
            ],
            'availableCredit': float(payment_available_credit(payment)),
        }
        return Response(receipt_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse(self, request, pk=None):
        payment = self.get_object()
        serializer = PaymentReversalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reverse_payment(payment, serializer.validated_data['reason'].strip(), request.user if request.user.is_authenticated else None)
        except Exception as exc:
            from django.core.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return Response({'detail': exc.messages}, status=status.HTTP_400_BAD_REQUEST)
            raise
        return Response(PaymentSerializer(self.get_queryset().get(pk=payment.pk)).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='refund')
    def refund(self, request, pk=None):
        payment = self.get_object()
        serializer = PaymentRefundRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            refund = create_payment_refund(
                payment, **serializer.validated_data,
                actor=request.user if request.user.is_authenticated else None,
            )
        except Exception as exc:
            from django.core.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return Response({'detail': exc.messages}, status=status.HTTP_400_BAD_REQUEST)
            raise
        return Response({
            'refund': {'id': refund.id, 'paymentId': payment.id, 'amount': refund.amount,
                       'date': refund.date, 'method': refund.method, 'reference': refund.reference},
            'availableCredit': payment_available_credit(payment),
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='release-reservation')
    def release_reservation(self, request, pk=None):
        payment = self.get_object()
        serializer = ReservationReleaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from django.db import transaction
        with transaction.atomic():
            locked_payment = Payment.objects.select_for_update().get(pk=payment.pk)
            from .models import FutureRentReservation
            reservation = FutureRentReservation.objects.select_for_update().filter(
                pk=serializer.validated_data['reservationId'], payment=locked_payment,
            ).first()
            if not reservation:
                return Response({'reservationId': 'Reservation does not belong to this payment.'}, status=status.HTTP_400_BAD_REQUEST)
            if reservation.status != 'reserved':
                return Response({'detail': 'Only an unapplied reservation can be released.'}, status=status.HTTP_400_BAD_REQUEST)
            reservation.released_amount += reservation.remaining_amount
            reservation.status = 'released'
            reservation.release_reason = serializer.validated_data['reason'].strip()
            reservation.save(update_fields=['released_amount', 'status', 'release_reason', 'updated_at'])
        return Response(PaymentSerializer(self.get_queryset().get(pk=payment.pk)).data, status=status.HTTP_200_OK)


class DepositViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DepositSerializer

    def get_queryset(self):
        active_prop_id = get_active_property_id()
        qs = Deposit.objects.all().select_related('tenancy__room', 'tenant').prefetch_related('deductions', 'payments')
        if active_prop_id:
            qs = qs.filter(tenancy__room__property_id=active_prop_id)
        status_param = self.request.query_params.get('status')
        if status_param in ('unpaid', 'partially_paid', 'held', 'waived', 'settled', 'refunded', 'applied'):
            qs = qs.filter(status=status_param)

        tenancy_id = self.request.query_params.get('tenancyId')
        if tenancy_id:
            qs = qs.filter(tenancy_id=tenancy_id)

        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        room_id = self.request.query_params.get('roomId')
        if room_id:
            qs = qs.filter(tenancy__room_id=room_id)

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(tenant__full_name__icontains=search) |
                Q(reference__icontains=search) |
                Q(refund_reference__icontains=search) |
                Q(tenancy__room__name__icontains=search)
            )

        return qs.order_by('-created_at')

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        deposit = self.get_object()
        serializer = RecordDepositPaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            record_deposit_payment(
                deposit=deposit,
                amount=serializer.validated_data['amount'],
                payment_date=serializer.validated_data['paymentDate'],
                method=serializer.validated_data['method'],
                reference=serializer.validated_data.get('reference', ''),
                notes=serializer.validated_data.get('notes', ''),
            )
        except ValidationError as exc:
            detail = exc.messages if hasattr(exc, 'messages') else str(exc)
            return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)

        deposit.refresh_from_db()
        return Response(DepositSerializer(deposit).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='settle')
    def settle(self, request, pk=None):
        deposit = self.get_object()
        serializer = DepositSettlementSerializer(
            data=request.data,
            context={'deposit': deposit, 'tenancy': deposit.tenancy, 'request': request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        settled_deposit = serializer.save()
        return Response(DepositSerializer(settled_deposit).data, status=status.HTTP_200_OK)
