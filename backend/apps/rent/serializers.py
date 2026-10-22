from rest_framework import serializers
from .models import RentCharge


class RentChargeSerializer(serializers.ModelSerializer):
    tenancyId = serializers.PrimaryKeyRelatedField(source='tenancy', read_only=True)
    roomId = serializers.PrimaryKeyRelatedField(source='room', read_only=True)
    roomName = serializers.CharField(source='room.name', read_only=True)
    tenantId = serializers.IntegerField(source='tenancy.tenant.id', read_only=True)
    tenantName = serializers.CharField(source='tenancy.tenant.full_name', read_only=True)
    dueDate = serializers.DateField(source='due_date')
    paidAmount = serializers.DecimalField(source='paid_amount', max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = RentCharge
        fields = [
            'id',
            'tenancyId',
            'roomId',
            'roomName',
            'tenantId',
            'tenantName',
            'month',
            'dueDate',
            'amount',
            'paidAmount',
            'balance',
            'status',
            'created_at',
            'updated_at',
        ]


class GenerateChargesRequestSerializer(serializers.Serializer):
    month = serializers.RegexField(
        regex=r'^\d{4}-(0[1-9]|1[0-2])$',
        required=True,
        error_messages={'invalid': 'Month must be in YYYY-MM format, e.g. 2026-10'}
    )
