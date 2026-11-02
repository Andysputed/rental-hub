import re
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import Payment, Deposit
from .serializers import (
    PaymentSerializer,
    RecordPaymentSerializer,
    DepositSerializer,
    DepositSettlementSerializer,
)


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        qs = Payment.objects.all().select_related('tenant', 'tenancy', 'room', 'charge').prefetch_related('allocations__charge')

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

        payment = serializer.save()
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='receipt')
    def receipt(self, request, pk=None):
        payment = self.get_object()
        charge = payment.charge
        room = payment.room
        prop = room.property
        settings = getattr(prop, 'settings', None)

        charge_total = charge.amount if charge else payment.amount
        paid_amount_now = charge.paid_amount if charge else payment.amount
        balance_after = max(Decimal('0.00'), charge_total - paid_amount_now)
        balance_before = balance_after + payment.amount

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
                'chargeId': charge.id if charge else None,
                'month': charge.month if charge else None,
                'chargeAmount': float(charge_total),
                'balanceBefore': float(balance_before),
                'balanceAfter': float(balance_after),
            }
        }
        return Response(receipt_data, status=status.HTTP_200_OK)


class DepositViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DepositSerializer

    def get_queryset(self):
        qs = Deposit.objects.all().select_related('tenancy__room', 'tenant').prefetch_related('deductions')
        status_param = self.request.query_params.get('status')
        if status_param in ('held', 'settled', 'refunded', 'applied'):
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

        return qs.order_by('-received_date')

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
