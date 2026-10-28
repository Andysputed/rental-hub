from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import models
from django.db.models import Q
from apps.payments.serializers import DepositSerializer, DepositSettlementSerializer
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
        qs = Tenant.objects.all().prefetch_related('tenancies__room')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(phone__icontains=search))
        status_param = self.request.query_params.get('status')
        if status_param in ('active', 'former'):
            qs = qs.filter(status=status_param)
        return qs.order_by('full_name')


class TenancyViewSet(viewsets.ModelViewSet):
    serializer_class = TenancySerializer

    def get_queryset(self):
        qs = Tenancy.objects.all().select_related('tenant', 'room')
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

        serializer = MoveOutSerializer(instance=tenancy, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_tenancy = serializer.save()
        return Response(TenancySerializer(updated_tenancy).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='settlement-summary')
    def settlement_summary(self, request, pk=None):
        tenancy = self.get_object()
        deposit = tenancy.deposits.order_by('-received_date').first()

        unpaid_charges = tenancy.charges.filter(
            paid_amount__lt=models.F('amount')
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

        deposit_data = None
        if deposit:
            deposit_data = {
                'id': deposit.id,
                'amount': float(deposit.amount),
                'status': deposit.status,
                'receivedDate': str(deposit.received_date),
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
            context={'tenancy': tenancy, 'deposit': deposit, 'request': request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        settled_deposit = serializer.save()
        return Response(DepositSerializer(settled_deposit).data, status=status.HTTP_200_OK)
