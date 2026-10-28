from decimal import Decimal
from rest_framework import serializers
from django.db import models, transaction
from django.utils import timezone
from apps.properties.models import Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from .models import Payment, PaymentAllocation, Deposit, DepositDeduction


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


class DepositDeductionSerializer(serializers.ModelSerializer):
    deductionType = serializers.CharField(source='deduction_type')
    chargeId = serializers.IntegerField(source='charge.id', allow_null=True, read_only=True)
    chargeMonth = serializers.CharField(source='charge.month', allow_null=True, read_only=True)

    class Meta:
        model = DepositDeduction
        fields = [
            'id',
            'deductionType',
            'description',
            'amount',
            'chargeId',
            'chargeMonth',
            'created_at',
        ]


class DepositSerializer(serializers.ModelSerializer):
    tenancyId = serializers.PrimaryKeyRelatedField(source='tenancy', read_only=True)
    tenantId = serializers.IntegerField(source='tenant.id', read_only=True)
    tenantName = serializers.CharField(source='tenant.full_name', read_only=True)
    tenantPhone = serializers.CharField(source='tenant.phone', read_only=True)
    roomId = serializers.IntegerField(source='tenancy.room.id', read_only=True)
    roomName = serializers.CharField(source='tenancy.room.name', read_only=True)
    roomNumber = serializers.CharField(source='tenancy.room.number', read_only=True)
    receivedDate = serializers.DateField(source='received_date')
    rentDeducted = serializers.DecimalField(source='rent_deducted', max_digits=12, decimal_places=2)
    repairsDeducted = serializers.DecimalField(source='repairs_deducted', max_digits=12, decimal_places=2)
    totalDeductions = serializers.DecimalField(source='total_deductions', max_digits=12, decimal_places=2, read_only=True)
    refundableBalance = serializers.DecimalField(source='refundable_balance', max_digits=12, decimal_places=2, read_only=True)
    refundAmount = serializers.DecimalField(source='refund_amount', max_digits=12, decimal_places=2)
    refundMethod = serializers.CharField(source='refund_method')
    refundReference = serializers.CharField(source='refund_reference')
    refundDate = serializers.DateField(source='refund_date', allow_null=True)
    settledAt = serializers.DateTimeField(source='settled_at', allow_null=True)
    settlementNotes = serializers.CharField(source='settlement_notes')
    deductions = DepositDeductionSerializer(many=True, read_only=True)

    class Meta:
        model = Deposit
        fields = [
            'id',
            'tenancyId',
            'tenantId',
            'tenantName',
            'tenantPhone',
            'roomId',
            'roomName',
            'roomNumber',
            'amount',
            'receivedDate',
            'received_date',
            'status',
            'reference',
            'notes',
            'rentDeducted',
            'repairsDeducted',
            'totalDeductions',
            'refundableBalance',
            'refundAmount',
            'refundMethod',
            'refundReference',
            'refundDate',
            'settledAt',
            'settlementNotes',
            'deductions',
            'created_at',
            'updated_at',
        ]


class RepairDeductionItemSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    category = serializers.ChoiceField(choices=['repair', 'cleaning', 'other'], default='repair')


class DepositSettlementSerializer(serializers.Serializer):
    tenancyId = serializers.IntegerField(required=False)
    depositId = serializers.IntegerField(required=False)
    endDate = serializers.DateField(required=False, allow_null=True)
    settlementDate = serializers.DateField(required=False, allow_null=True)
    rentDeduction = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), min_value=Decimal('0.00'))
    repairDeductions = RepairDeductionItemSerializer(many=True, required=False, default=list)
    refundAmount = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), min_value=Decimal('0.00'))
    refundMethod = serializers.ChoiceField(choices=['mpesa', 'cash', 'bank'], default='mpesa', required=False, allow_blank=True)
    refundReference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    refundDate = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        tenancy = self.context.get('tenancy')
        deposit = self.context.get('deposit')

        if not tenancy and 'tenancyId' in attrs:
            try:
                tenancy = Tenancy.objects.get(id=attrs['tenancyId'])
            except Tenancy.DoesNotExist:
                raise serializers.ValidationError({"tenancyId": "Specified tenancy does not exist."})

        if not deposit and 'depositId' in attrs:
            try:
                deposit = Deposit.objects.get(id=attrs['depositId'])
            except Deposit.DoesNotExist:
                raise serializers.ValidationError({"depositId": "Specified deposit does not exist."})

        if not deposit and tenancy:
            deposit = tenancy.deposits.order_by('-received_date').first()

        if not deposit:
            raise serializers.ValidationError({"deposit": "No deposit record found for this tenancy."})

        if not tenancy:
            tenancy = deposit.tenancy

        if deposit.tenancy_id != tenancy.id:
            raise serializers.ValidationError({"deposit": "Deposit does not belong to the specified tenancy."})

        if deposit.status in ('settled', 'refunded', 'applied'):
            raise serializers.ValidationError({"deposit": f"Deposit #{deposit.id} has already been settled and cannot be settled again."})

        end_date = attrs.get('endDate')
        if end_date and tenancy.start_date and end_date < tenancy.start_date:
            raise serializers.ValidationError({"endDate": f"Move-out date cannot be before move-in date ({tenancy.start_date})."})

        rent_deduction = attrs.get('rentDeduction', Decimal('0.00'))
        unpaid_charges = list(RentCharge.objects.filter(tenancy=tenancy, paid_amount__lt=models.F('amount')).order_by('month', 'due_date'))
        total_eligible_arrears = sum((c.balance for c in unpaid_charges), Decimal('0.00'))

        if rent_deduction > total_eligible_arrears:
            raise serializers.ValidationError({
                "rentDeduction": f"Rent deduction ({rent_deduction} KES) exceeds eligible outstanding arrears ({total_eligible_arrears} KES)."
            })

        repair_deductions = attrs.get('repairDeductions', [])
        total_repairs = sum((item['amount'] for item in repair_deductions), Decimal('0.00'))

        total_deductions = rent_deduction + total_repairs
        if total_deductions > deposit.amount:
            raise serializers.ValidationError({
                "totalDeductions": f"Total deductions ({total_deductions} KES) exceed deposit held ({deposit.amount} KES)."
            })

        max_refundable = deposit.amount - total_deductions
        refund_amount = attrs.get('refundAmount', Decimal('0.00'))
        if refund_amount > max_refundable:
            raise serializers.ValidationError({
                "refundAmount": f"Refund amount ({refund_amount} KES) cannot exceed refundable balance ({max_refundable} KES)."
            })

        attrs['resolved_tenancy'] = tenancy
        attrs['resolved_deposit'] = deposit
        attrs['unpaid_charges'] = unpaid_charges
        attrs['total_repairs'] = total_repairs
        attrs['total_deductions'] = total_deductions
        attrs['refundable_balance'] = max_refundable

        return attrs

    def create(self, validated_data):
        tenancy_id = validated_data['resolved_tenancy'].id
        deposit_id = validated_data['resolved_deposit'].id

        with transaction.atomic():
            deposit = Deposit.objects.select_for_update().get(id=deposit_id)
            tenancy = Tenancy.objects.select_for_update().get(id=tenancy_id)

            if deposit.status in ('settled', 'refunded', 'applied'):
                raise serializers.ValidationError({"deposit": "This deposit has already been settled and cannot be settled again."})

            rent_deduction = validated_data['rentDeduction']
            repair_deductions = validated_data.get('repairDeductions', [])
            refund_amount = validated_data['refundAmount']
            refund_method = validated_data.get('refundMethod', 'mpesa')
            refund_reference = validated_data.get('refundReference', '')
            refund_date = validated_data.get('refundDate') or validated_data.get('settlementDate') or timezone.now().date()
            settlement_notes = validated_data.get('notes', '').strip()
            end_date = validated_data.get('endDate')

            # 1. Apply rent deduction to unpaid charges
            remaining_rent_ded = rent_deduction
            if remaining_rent_ded > Decimal('0.00'):
                unpaid_charges = RentCharge.objects.select_for_update().filter(
                    tenancy=tenancy, paid_amount__lt=models.F('amount')
                ).order_by('month', 'due_date')

                for charge in unpaid_charges:
                    if remaining_rent_ded <= Decimal('0.00'):
                        break
                    charge_balance = charge.balance
                    alloc = min(charge_balance, remaining_rent_ded)
                    charge.paid_amount += alloc
                    charge.update_status()
                    charge.save()

                    DepositDeduction.objects.create(
                        deposit=deposit,
                        deduction_type='rent',
                        description=f"Applied to {charge.month} rent ({charge.room.name})",
                        amount=alloc,
                        charge=charge
                    )
                    remaining_rent_ded -= alloc

            # 2. Record repair/damage deductions
            for item in repair_deductions:
                DepositDeduction.objects.create(
                    deposit=deposit,
                    deduction_type=item.get('category', 'repair'),
                    description=item['description'].strip(),
                    amount=item['amount']
                )

            # 3. Update deposit record
            total_repairs = validated_data['total_repairs']
            deposit.rent_deducted = rent_deduction
            deposit.repairs_deducted = total_repairs
            deposit.refund_amount = refund_amount
            deposit.refund_method = refund_method if refund_amount > Decimal('0.00') else ''
            deposit.refund_reference = refund_reference if refund_amount > Decimal('0.00') else ''
            deposit.refund_date = refund_date if refund_amount > Decimal('0.00') else None
            deposit.settled_at = timezone.now()
            deposit.settlement_notes = settlement_notes

            if refund_amount == deposit.amount and rent_deduction == Decimal('0.00') and total_repairs == Decimal('0.00'):
                deposit.status = 'refunded'
            elif rent_deduction == deposit.amount and total_repairs == Decimal('0.00') and refund_amount == Decimal('0.00'):
                deposit.status = 'applied'
            else:
                deposit.status = 'settled'

            deposit.save()

            # 4. If tenancy was active, terminate tenancy and vacate room
            if tenancy.status == 'active':
                tenancy.end_date = end_date or timezone.now().date()
                tenancy.status = 'ended'
                tenancy.save()

                tenant = tenancy.tenant
                if not tenant.tenancies.filter(status='active').exclude(id=tenancy.id).exists():
                    tenant.status = 'former'
                    tenant.save()

                room = tenancy.room
                room.status = 'vacant'
                room.save()

        return deposit
