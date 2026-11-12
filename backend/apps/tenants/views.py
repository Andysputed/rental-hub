from decimal import Decimal
from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from django.db.models import Q
from django.utils import timezone
from apps.properties.services import get_active_property_id
from apps.payments.serializers import DepositSerializer, DepositSettlementSerializer
from apps.payments.models import Payment, PaymentAllocation, PaymentRefund, PaymentReversal, FutureRentReservation
from apps.payments.ledger import payment_available_credit
from .models import Tenant, Tenancy
from .serializers import (
    TenantSerializer,
    TenancySerializer,
    TenantRegistrationSerializer,
    MoveOutSerializer,
)


class TenantViewSet(viewsets.ModelViewSet):
    serializer_class = TenantSerializer

    def get_queryset(self):
        active_prop_id = get_active_property_id()
        if active_prop_id:
            qs = Tenant.objects.filter(
                Q(tenancies__room__property_id=active_prop_id) | Q(tenancies__isnull=True)
            ).distinct().prefetch_related('tenancies__room')
        else:
            qs = Tenant.objects.all().prefetch_related('tenancies__room')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(phone__icontains=search))
        status_param = self.request.query_params.get('status')
        if status_param in ('active', 'former'):
            qs = qs.filter(status=status_param)
        return qs.order_by('full_name')


class TenancyViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = TenancySerializer

    def get_queryset(self):
        active_prop_id = get_active_property_id()
        qs = Tenancy.objects.all().select_related('tenant', 'room')
        if active_prop_id:
            qs = qs.filter(room__property_id=active_prop_id)
        room_id = self.request.query_params.get('roomId')
        if room_id:
            qs = qs.filter(room_id=room_id)
        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        status_param = self.request.query_params.get('status')
        if status_param in ('active', 'ended'):
            qs = qs.filter(status=status_param)
        return qs.order_by('-start_date')

    @action(detail=False, methods=['post'], url_path='register')
    def register(self, request):
        serializer = TenantRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        tenancy = serializer.save()
        response_serializer = TenancySerializer(tenancy)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='move-out')
    def move_out(self, request, pk=None):
        tenancy = self.get_object()
        if tenancy.status == 'ended':
            return Response(
                {"error": "This tenancy has already ended."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = MoveOutSerializer(instance=tenancy, data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_tenancy = serializer.save()
        return Response(TenancySerializer(updated_tenancy).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='settlement-summary')
    def settlement_summary(self, request, pk=None):
        tenancy = self.get_object()
        deposit = tenancy.deposits.order_by('-created_at').first()

        as_of_date = timezone.localdate()
        unpaid_charges = tenancy.charges.filter(
            paid_amount__lt=models.F('amount'),
            due_date__lte=as_of_date,
            month__gte=tenancy.start_date.strftime('%Y-%m'),
            month__lte=as_of_date.strftime('%Y-%m'),
        ).order_by('month', 'due_date')

        charges_data = [
            {
                'id': c.id,
                'month': c.month,
                'amount': float(c.amount),
                'paidAmount': float(c.paid_amount),
                'balance': float(c.balance),
                'dueDate': str(c.due_date),
            }
            for c in unpaid_charges
        ]

        total_arrears = sum((c.balance for c in unpaid_charges), Decimal('0.00'))
        payments = Payment.objects.filter(tenancy=tenancy).prefetch_related('reservations', 'refunds')
        payment_ids = payments.values_list('id', flat=True)
        total_received = payments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        allocated = PaymentAllocation.objects.filter(payment_id__in=payment_ids).exclude(
            reversal_entry__isnull=False
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        refunds_total = PaymentRefund.objects.filter(payment_id__in=payment_ids).aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')
        reversed_total = PaymentReversal.objects.filter(payment_id__in=payment_ids).aggregate(
            total=models.Sum('payment__amount')
        )['total'] or Decimal('0.00')
        available_credit = sum((payment_available_credit(p) for p in payments), Decimal('0.00'))
        reserved_credit = sum((
            reservation.remaining_amount
            for reservation in FutureRentReservation.objects.filter(
                tenancy=tenancy, status='reserved'
            ).select_related('payment').exclude(payment__reversal__isnull=False)
        ), Decimal('0.00'))

        deposit_data = None
        if deposit:
            deposit_data = {
                'id': deposit.id,
                'requiredAmount': float(deposit.required_amount),
                'amount': float(deposit.amount),
                'totalPaid': float(deposit.total_paid),
                'outstandingBalance': float(deposit.outstanding_balance),
                'isWaived': deposit.is_waived,
                'waivedReason': deposit.waived_reason,
                'status': deposit.status,
                'receivedDate': str(deposit.received_date) if deposit.received_date else None,
                'reference': deposit.reference,
                'rentDeducted': float(deposit.rent_deducted),
                'repairsDeducted': float(deposit.repairs_deducted),
                'totalDeductions': float(deposit.total_deductions),
                'refundableBalance': float(deposit.refundable_balance),
                'refundAmount': float(deposit.refund_amount),
                'settledAt': str(deposit.settled_at) if deposit.settled_at else None,
            }

        return Response({
            'tenancyId': tenancy.id,
            'tenantId': tenancy.tenant.id,
            'tenantName': tenancy.tenant.full_name,
            'roomId': tenancy.room.id,
            'roomName': tenancy.room.name,
            'startDate': str(tenancy.start_date),
            'endDate': str(tenancy.end_date) if tenancy.end_date else None,
            'tenancyStatus': tenancy.status,
            'deposit': deposit_data,
            'eligibleArrears': {
                'total': float(total_arrears),
                'charges': charges_data,
            },
            'financialSummary': {
                'totalRentCharged': float(tenancy.charges.aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')),
                'totalPaymentsReceived': float(total_received),
                'totalRentAllocated': float(allocated),
                'outstandingRent': float(total_arrears),
                'availableAdvanceCredit': float(available_credit),
                'reservedFutureCredit': float(reserved_credit),
                'refunds': float(refunds_total),
                'reversals': float(reversed_total),
            },
            'maxDeductionAllowed': float(deposit.amount) if deposit else 0.0,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='settle-deposit')
    def settle_deposit(self, request, pk=None):
        tenancy = self.get_object()
        deposit = tenancy.deposits.order_by('-received_date').first()
        if not deposit:
            return Response(
                {"deposit": "No deposit record found for this tenancy."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DepositSettlementSerializer(
            data=request.data,
            context={'tenancy': tenancy, 'deposit': deposit}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        settled_deposit = serializer.save()
        return Response(DepositSerializer(settled_deposit).data, status=status.HTTP_200_OK)
