from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from apps.properties.models import Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from .models import Payment, PaymentAllocation, Deposit


class PaymentAllocationSerializer(serializers.ModelSerializer):
    chargeId = serializers.PrimaryKeyRelatedField(source='charge', read_only=True)
    chargeMonth = serializers.CharField(source='charge.month', read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ['id', 'chargeId', 'chargeMonth', 'amount', 'created_at']


class PaymentSerializer(serializers.ModelSerializer):
    receiptNumber = serializers.CharField(source='receipt_number')
    tenantId = serializers.IntegerField(source='tenant.id', read_only=True)
    tenantName = serializers.CharField(source='tenant.full_name', read_only=True)
    tenancyId = serializers.IntegerField(source='tenancy.id', read_only=True)
    roomId = serializers.IntegerField(source='room.id', read_only=True)
    roomName = serializers.CharField(source='room.name', read_only=True)
    chargeId = serializers.IntegerField(source='charge.id', allow_null=True, read_only=True)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id',
            'receiptNumber',
            'tenantId',
            'tenantName',
            'tenancyId',
            'roomId',
            'roomName',
            'chargeId',
            'amount',
            'date',
            'method',
            'reference',
            'notes',
            'allocations',
            'created_at',
            'updated_at',
        ]


def generate_next_receipt_number(payment_date):
    """Generate sequential receipt number format: RH-YYYY-XXX."""
    year = payment_date.year
    prefix = f"RH-{year}-"
    last_payment = Payment.objects.filter(receipt_number__startswith=prefix).order_by('-receipt_number').first()
    if last_payment:
        try:
            last_seq = int(last_payment.receipt_number.split('-')[-1])
            new_seq = last_seq + 1
        except ValueError:
            new_seq = Payment.objects.filter(receipt_number__startswith=prefix).count() + 1
    else:
        new_seq = 1
    return f"{prefix}{new_seq:03d}"


class RecordPaymentSerializer(serializers.Serializer):
    roomId = serializers.IntegerField(required=True)
    tenancyId = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=True)
    method = serializers.ChoiceField(choices=['mpesa', 'cash', 'bank'], default='mpesa')
    reference = serializers.CharField(max_length=100, required=True)
    paymentDate = serializers.DateField(required=True)
    chargeId = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_reference(self, value):
        val = value.strip()
        if Payment.objects.filter(reference=val).exists():
            raise serializers.ValidationError(f"Payment with transaction reference '{val}' has already been recorded.")
        return val

    def validate(self, attrs):
        room_id = attrs.get('roomId')
        try:
            room = Room.objects.get(id=room_id)
        except Room.DoesNotExist:
            raise serializers.ValidationError({"roomId": "Room does not exist."})

        tenancy_id = attrs.get('tenancyId')
        if tenancy_id:
            tenancy = Tenancy.objects.filter(id=tenancy_id, room=room).first()
            if not tenancy:
                raise serializers.ValidationError({"tenancyId": "Specified tenancy does not belong to this room."})
        else:
            active_tenancy = room.get_current_tenancy()
            if not active_tenancy:
                raise serializers.ValidationError({"roomId": f"{room.name} does not have an active tenancy."})

        return attrs

    def create(self, validated_data):
        room_id = validated_data['roomId']
        tenancy_id = validated_data.get('tenancyId')
        amount = validated_data['amount']
        method = validated_data['method']
        reference = validated_data['reference'].strip()
        payment_date = validated_data['paymentDate']
        charge_id = validated_data.get('chargeId')
        notes = validated_data.get('notes', '')

        with transaction.atomic():
            room = Room.objects.select_for_update().get(id=room_id)
            if tenancy_id:
                tenancy = Tenancy.objects.select_for_update().get(id=tenancy_id, room=room)
            else:
                tenancy = room.get_current_tenancy()
                if not tenancy:
                    raise serializers.ValidationError({"roomId": f"{room.name} does not have an active tenancy."})
            tenant = tenancy.tenant

            # Determine charge to apply payment to
            charge = None
            if charge_id:
                try:
                    charge = RentCharge.objects.select_for_update().get(id=charge_id, tenancy=tenancy)
                except RentCharge.DoesNotExist:
                    raise serializers.ValidationError({"chargeId": "Specified rent charge does not belong to this tenancy."})
            else:
                # Find current month charge or oldest unpaid charge for this tenancy
                payment_month = payment_date.strftime('%Y-%m')
                charge = RentCharge.objects.select_for_update().filter(
                    tenancy=tenancy,
                    month=payment_month
                ).first()

                if not charge:
                    # Look for oldest charge with outstanding balance
                    charge = RentCharge.objects.select_for_update().filter(
                        tenancy=tenancy
                    ).exclude(status='paid').order_by('month').first()

                if not charge:
                    # If still no charge, create one for this month
                    charge = RentCharge.objects.create(
                        tenancy=tenancy,
                        room=room,
                        month=payment_month,
                        due_date=payment_date,
                        amount=tenancy.monthly_rent,
                        paid_amount=Decimal('0.00'),
                        status='unpaid'
                    )

            # Generate receipt number
            receipt_number = generate_next_receipt_number(payment_date)

            payment = Payment.objects.create(
                tenant=tenant,
                tenancy=tenancy,
                room=room,
                charge=charge,
                receipt_number=receipt_number,
                amount=amount,
                date=payment_date,
                method=method,
                reference=reference,
                notes=notes
            )

            # Allocate payment to the charge
            PaymentAllocation.objects.create(
                payment=payment,
                charge=charge,
                amount=amount
            )

            # Update charge balance and status
            charge.paid_amount += amount
            charge.update_status()
            charge.save()

        return payment


class DepositSerializer(serializers.ModelSerializer):
    tenancyId = serializers.PrimaryKeyRelatedField(source='tenancy', read_only=True)
    tenantName = serializers.CharField(source='tenant.full_name', read_only=True)
    roomName = serializers.CharField(source='tenancy.room.name', read_only=True)

    class Meta:
        model = Deposit
        fields = [
            'id',
            'tenancyId',
            'tenantName',
            'roomName',
            'amount',
            'received_date',
            'status',
            'reference',
            'notes',
            'created_at',
        ]
