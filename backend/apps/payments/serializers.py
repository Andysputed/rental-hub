from decimal import Decimal
from rest_framework import serializers
from django.db import models, transaction
from django.utils import timezone
from django.conf import settings as django_settings
from apps.properties.models import Room
from apps.properties.services import get_active_property_id
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from apps.rent.services import generate_tenancy_month_charge
from .models import (
    Payment, PaymentAllocation, Deposit, DepositPayment, DepositDeduction, ReceiptSequence,
    FutureRentReservation, PaymentRefund, PaymentReversal,
)
from .ledger import payment_available_credit, reverse_payment, create_payment_refund, reconcile_tenancy_advance_credit


class PaymentAllocationSerializer(serializers.ModelSerializer):
    chargeId = serializers.PrimaryKeyRelatedField(source='charge', read_only=True)
    chargeMonth = serializers.CharField(source='charge.month', read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ['id', 'chargeId', 'chargeMonth', 'amount', 'created_at']


class FutureRentReservationSerializer(serializers.ModelSerializer):
    remainingAmount = serializers.DecimalField(source='remaining_amount', max_digits=12, decimal_places=2, read_only=True)
    chargeId = serializers.IntegerField(source='charge_id', allow_null=True, read_only=True)

    class Meta:
        model = FutureRentReservation
        fields = ['id', 'month', 'amount', 'applied_amount', 'released_amount', 'remainingAmount', 'status', 'chargeId', 'created_at']


class PaymentRefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentRefund
        fields = ['id', 'amount', 'date', 'method', 'reference', 'reason', 'created_at']


class PaymentSerializer(serializers.ModelSerializer):
    receiptNumber = serializers.CharField(source='receipt_number')
    tenantId = serializers.IntegerField(source='tenant.id', read_only=True)
    tenantName = serializers.CharField(source='tenant.full_name', read_only=True)
    tenancyId = serializers.IntegerField(source='tenancy.id', read_only=True)
    roomId = serializers.IntegerField(source='room.id', read_only=True)
    roomName = serializers.CharField(source='room.name', read_only=True)
    chargeId = serializers.IntegerField(source='charge.id', allow_null=True, read_only=True)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    reservations = FutureRentReservationSerializer(many=True, read_only=True)
    refunds = PaymentRefundSerializer(many=True, read_only=True)
    availableCredit = serializers.SerializerMethodField()
    isReversed = serializers.SerializerMethodField()

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
            'reservations',
            'refunds',
            'availableCredit',
            'isReversed',
            'created_at',
            'updated_at',
        ]

    def get_availableCredit(self, obj):
        return payment_available_credit(obj)

    def get_isReversed(self, obj):
        return hasattr(obj, 'reversal')


class RequestedAllocationSerializer(serializers.Serializer):
    chargeId = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))


class RequestedReservationSerializer(serializers.Serializer):
    month = serializers.RegexField(r'^\d{4}-(0[1-9]|1[0-2])$')
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))


class RecordPaymentSerializer(serializers.Serializer):
    roomId = serializers.IntegerField(required=True)
    tenancyId = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=True)
    method = serializers.ChoiceField(choices=['mpesa', 'cash', 'bank'], default='mpesa')
    reference = serializers.CharField(max_length=100, required=True)
    paymentDate = serializers.DateField(required=True)
    chargeId = serializers.IntegerField(required=False, allow_null=True)
    chargeMonth = serializers.RegexField(r'^\d{4}-(0[1-9]|1[0-2])$', required=False, allow_null=True)
    allocationMode = serializers.ChoiceField(choices=['automatic', 'manual'], default='automatic')
    allocations = RequestedAllocationSerializer(many=True, required=False, default=list)
    reservations = RequestedReservationSerializer(many=True, required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_reference(self, value):
        val = value.strip()
        if Payment.objects.filter(reference=val).exists():
            raise serializers.ValidationError(f"Payment with transaction reference '{val}' has already been recorded.")
        return val

    def validate(self, attrs):
        room_id = attrs.get('roomId')
        active_prop_id = get_active_property_id()
        try:
            if active_prop_id:
                room = Room.objects.get(id=room_id, property_id=active_prop_id)
            else:
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
            tenancy = active_tenancy

        charge_month = attrs.get('chargeMonth')
        if charge_month:
            start_month = tenancy.start_date.strftime('%Y-%m')
            end_month = tenancy.end_date.strftime('%Y-%m') if tenancy.end_date else None
            if charge_month < start_month or (end_month and charge_month > end_month):
                raise serializers.ValidationError({'chargeMonth': 'Selected rent period is outside this tenancy.'})

        if attrs.get('allocationMode') == 'manual':
            if attrs.get('chargeId'):
                raise serializers.ValidationError({'chargeId': 'Use allocations when manual allocation is selected.'})
            months = [item['month'] for item in attrs.get('reservations', [])]
            if len(months) != len(set(months)):
                raise serializers.ValidationError({'reservations': 'Only one reservation per rent month is allowed.'})
        elif attrs.get('allocations') or attrs.get('reservations'):
            raise serializers.ValidationError({'allocationMode': 'Select manual mode to provide allocations or reservations.'})
        return attrs

    def create(self, validated_data):
        room_id = validated_data['roomId']
        tenancy_id = validated_data.get('tenancyId')
        amount = validated_data['amount']
        method = validated_data['method']
        reference = validated_data['reference'].strip()
        payment_date = validated_data['paymentDate']
        charge_id = validated_data.get('chargeId')
        charge_month = validated_data.get('chargeMonth')
        notes = validated_data.get('notes', '')
        mode = validated_data.get('allocationMode', 'automatic')
        requested_allocations = validated_data.get('allocations', [])
        requested_reservations = validated_data.get('reservations', [])

        with transaction.atomic():
            room = Room.objects.select_for_update().get(id=room_id)
            if tenancy_id:
                tenancy = Tenancy.objects.select_for_update().get(id=tenancy_id, room=room)
            else:
                tenancy = room.get_current_tenancy()
                if not tenancy:
                    raise serializers.ValidationError({"roomId": f"{room.name} does not have an active tenancy."})
                tenancy = Tenancy.objects.select_for_update().get(pk=tenancy.pk)
            # All payment writers for a tenancy serialize on this row. This keeps
            # charge capacity and a receipt's allocatable funds from racing.
            tenancy = Tenancy.objects.select_for_update().get(pk=tenancy.pk)
            tenant = tenancy.tenant

            start_month = tenancy.start_date.strftime('%Y-%m')
            end_month = tenancy.end_date.strftime('%Y-%m') if tenancy.end_date else None

            # The move-in month is charged once, at the prorated amount. If the
            # tenancy was registered after that month's generation run, create
            # the first-month charge now so the payment settles it instead of
            # becoming unallocated credit.
            if mode == 'automatic' and charge_month and charge_month == start_month:
                generate_tenancy_month_charge(tenancy, charge_month)

            primary_charge = None
            if charge_id:
                try:
                    primary_charge = RentCharge.objects.select_for_update().get(id=charge_id, tenancy=tenancy)
                except RentCharge.DoesNotExist:
                    raise serializers.ValidationError({"chargeId": "Specified rent charge does not belong to this tenancy."})
                if primary_charge.month < start_month or (tenancy.end_date and primary_charge.month > tenancy.end_date.strftime('%Y-%m')):
                    raise serializers.ValidationError({'chargeId': 'Selected rent period is outside this tenancy.'})

            candidate_charges = list(RentCharge.objects.select_for_update().filter(
                tenancy=tenancy,
                month__gte=start_month,
                paid_amount__lt=models.F('amount'),
            ).order_by('month', 'due_date', 'id'))
            if end_month:
                candidate_charges = [charge for charge in candidate_charges if charge.month <= end_month]
            if primary_charge and primary_charge.balance > 0:
                candidate_charges = [primary_charge] + [c for c in candidate_charges if c.id != primary_charge.id]

            selected = []
            if mode == 'manual':
                seen_ids = set()
                for item in requested_allocations:
                    if item['chargeId'] in seen_ids:
                        raise serializers.ValidationError({'allocations': 'A rent charge may only be selected once.'})
                    seen_ids.add(item['chargeId'])
                    charge = RentCharge.objects.select_for_update().filter(
                        pk=item['chargeId'], tenancy=tenancy
                    ).first()
                    if not charge:
                        raise serializers.ValidationError({'allocations': 'Every selected charge must belong to this tenancy.'})
                    if charge.month < start_month or (end_month and charge.month > end_month):
                        raise serializers.ValidationError({'allocations': 'Selected rent period is outside this tenancy.'})
                    if item['amount'] > charge.balance:
                        raise serializers.ValidationError({'allocations': f'{charge.month} allocation exceeds its outstanding balance.'})
                    selected.append((charge, item['amount']))
                has_charge_months = set(RentCharge.objects.filter(
                    tenancy=tenancy,
                    month__in=[r['month'] for r in requested_reservations],
                ).values_list('month', flat=True))
                if has_charge_months:
                    raise serializers.ValidationError({'reservations': 'A charge already exists for a selected month; allocate to that charge instead.'})
                for item in requested_reservations:
                    if item['month'] < start_month:
                        raise serializers.ValidationError({'reservations': 'A reservation cannot predate move-in.'})
                    if item['month'] < timezone.now().strftime('%Y-%m'):
                        raise serializers.ValidationError({'reservations': 'A reservation must be for the current or a future rent period.'})
                    if end_month and item['month'] > end_month:
                        raise serializers.ValidationError({'reservations': 'A reservation cannot fall after the tenancy end date.'})
                selected_total = sum((a for _, a in selected), Decimal('0.00')) + sum(
                    (item['amount'] for item in requested_reservations), Decimal('0.00')
                )
                if selected_total > amount:
                    raise serializers.ValidationError({'amount': 'Allocations and reservations cannot exceed the payment amount.'})
            else:
                remaining = amount
                for charge in candidate_charges:
                    if remaining <= 0:
                        break
                    alloc = min(charge.balance, remaining)
                    if alloc > 0:
                        selected.append((charge, alloc))
                        remaining -= alloc

            # The counter row serializes issuers for a year. Both the increment and
            # payment roll back together if creation/allocation fails.
            sequence, _created = ReceiptSequence.objects.get_or_create(
                year=payment_date.year,
                defaults={'next_number': self._next_historical_sequence(payment_date.year)},
            )
            sequence = ReceiptSequence.objects.select_for_update().get(pk=sequence.pk)
            sequence.next_number = max(
                sequence.next_number,
                self._next_historical_sequence(payment_date.year),
            )
            receipt_number = f"RH-{payment_date.year}-{sequence.next_number:03d}"
            sequence.next_number += 1
            sequence.save(update_fields=['next_number'])

            payment = Payment.objects.create(
                tenant=tenant,
                tenancy=tenancy,
                room=room,
                charge=primary_charge,
                receipt_number=receipt_number,
                amount=amount,
                date=payment_date,
                method=method,
                reference=reference,
                notes=notes,
            )

            payment.charge = selected[0][0] if selected else None
            payment.save(update_fields=['charge'])
            for c, alloc_amount in selected:
                PaymentAllocation.objects.create(
                    payment=payment,
                    charge=c,
                    amount=alloc_amount
                )
                c.paid_amount += alloc_amount
                c.update_status()
                c.save()
            if mode == 'manual':
                for item in requested_reservations:
                    FutureRentReservation.objects.create(
                        payment=payment, tenancy=tenancy, month=item['month'],
                        amount=item['amount'], status='reserved',
                    )

            # Reconcile any remaining available advance credit against any outstanding unpaid charges
            reconcile_tenancy_advance_credit(tenancy)
            if not payment.charge:
                first_alloc = payment.allocations.first()
                if first_alloc:
                    payment.charge = first_alloc.charge
                    payment.save(update_fields=['charge'])

        return payment

    @staticmethod
    def _next_historical_sequence(year):
        prefix = f"RH-{year}-"
        values = Payment.objects.filter(receipt_number__startswith=prefix).values_list('receipt_number', flat=True)
        numbers = []
        for value in values:
            try:
                numbers.append(int(value[len(prefix):]))
            except ValueError:
                continue
        return max(numbers, default=0) + 1


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


class DepositPaymentSerializer(serializers.ModelSerializer):
    depositId = serializers.PrimaryKeyRelatedField(source='deposit', read_only=True)
    paymentDate = serializers.DateField(source='payment_date')

    class Meta:
        model = DepositPayment
        fields = [
            'id',
            'depositId',
            'amount',
            'paymentDate',
            'method',
            'reference',
            'notes',
            'created_at',
        ]


class RecordDepositPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=True)
    paymentDate = serializers.DateField(required=True)
    method = serializers.ChoiceField(choices=['mpesa', 'cash', 'bank'], default='mpesa')
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class DepositSerializer(serializers.ModelSerializer):
    tenancyId = serializers.PrimaryKeyRelatedField(source='tenancy', read_only=True)
    tenantId = serializers.IntegerField(source='tenant.id', read_only=True)
    tenantName = serializers.CharField(source='tenant.full_name', read_only=True)
    tenantPhone = serializers.CharField(source='tenant.phone', read_only=True)
    roomId = serializers.IntegerField(source='tenancy.room.id', read_only=True)
    roomName = serializers.CharField(source='tenancy.room.name', read_only=True)
    roomNumber = serializers.CharField(source='tenancy.room.number', read_only=True)
    requiredAmount = serializers.DecimalField(source='required_amount', max_digits=12, decimal_places=2)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    totalPaid = serializers.DecimalField(source='total_paid', max_digits=12, decimal_places=2, read_only=True)
    outstandingBalance = serializers.DecimalField(source='outstanding_balance', max_digits=12, decimal_places=2, read_only=True)
    receivedDate = serializers.DateField(source='received_date', allow_null=True)
    isWaived = serializers.BooleanField(source='is_waived')
    waivedReason = serializers.CharField(source='waived_reason')
    waivedAt = serializers.DateTimeField(source='waived_at', allow_null=True)
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
    payments = DepositPaymentSerializer(many=True, read_only=True)

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
            'requiredAmount',
            'amount',
            'totalPaid',
            'outstandingBalance',
            'isWaived',
            'waivedReason',
            'waivedAt',
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
            'payments',
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

        if deposit.is_waived:
            rent_ded = attrs.get('rentDeduction', Decimal('0.00'))
            repairs_ded = attrs.get('repairDeductions', [])
            refund_amt = attrs.get('refundAmount', Decimal('0.00'))
            if rent_ded > Decimal('0.00') or len(repairs_ded) > 0 or refund_amt > Decimal('0.00'):
                raise serializers.ValidationError({"deposit": "Cannot record deductions or refunds for a waived deposit."})

        if deposit.status in ('settled', 'refunded', 'applied'):
            raise serializers.ValidationError({"deposit": f"Deposit #{deposit.id} has already been settled and cannot be settled again."})

        end_date = attrs.get('endDate')
        if end_date and tenancy.start_date and end_date < tenancy.start_date:
            raise serializers.ValidationError({"endDate": f"Move-out date cannot be before move-in date ({tenancy.start_date})."})

        rent_deduction = attrs.get('rentDeduction', Decimal('0.00'))
        arrears_as_of = end_date or timezone.localdate()
        unpaid_charges = list(RentCharge.objects.filter(
            tenancy=tenancy,
            paid_amount__lt=models.F('amount'),
            due_date__lte=arrears_as_of,
            month__gte=tenancy.start_date.strftime('%Y-%m'),
            month__lte=arrears_as_of.strftime('%Y-%m'),
        ).order_by('month', 'due_date'))
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
        if refund_amount != max_refundable:
            raise serializers.ValidationError({
                "refundAmount": "Refund plus recorded deductions must account for the full deposit. Record any retained balance as a deduction."
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
            room_id = Tenancy.objects.only('room_id').get(id=tenancy_id).room_id
            room = Room.objects.select_for_update().get(id=room_id)
            tenancy = Tenancy.objects.select_for_update().get(id=tenancy_id)
            deposit = Deposit.objects.select_for_update().get(id=deposit_id)

            if deposit.status in ('settled', 'refunded', 'applied'):
                raise serializers.ValidationError({"deposit": "This deposit has already been settled and cannot be settled again."})

            rent_deduction = validated_data['rentDeduction']
            repair_deductions = validated_data.get('repairDeductions', [])
            refund_amount = validated_data['refundAmount']
            arrears_as_of = validated_data.get('endDate') or timezone.localdate()
            unpaid_charges = list(RentCharge.objects.select_for_update().filter(
                tenancy=tenancy,
                paid_amount__lt=models.F('amount'),
                due_date__lte=arrears_as_of,
                month__gte=tenancy.start_date.strftime('%Y-%m'),
                month__lte=arrears_as_of.strftime('%Y-%m'),
            ).order_by('month', 'due_date'))
            current_arrears = sum((charge.balance for charge in unpaid_charges), Decimal('0.00'))
            total_repairs = sum((item['amount'] for item in repair_deductions), Decimal('0.00'))
            if rent_deduction > current_arrears:
                raise serializers.ValidationError({
                    "rentDeduction": f"Rent deduction exceeds current outstanding arrears ({current_arrears} KES)."
                })
            if rent_deduction + total_repairs + refund_amount != deposit.amount:
                raise serializers.ValidationError({"refundAmount": "Deductions and refund must account for the full held deposit."})
            refund_method = validated_data.get('refundMethod', 'mpesa')
            refund_reference = validated_data.get('refundReference', '')
            refund_date = validated_data.get('refundDate') or validated_data.get('settlementDate') or timezone.now().date()
            settlement_notes = validated_data.get('notes', '').strip()
            end_date = validated_data.get('endDate')

            # 1. Apply rent deduction to unpaid charges
            remaining_rent_ded = rent_deduction
            if remaining_rent_ded > Decimal('0.00'):
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

                room.status = 'vacant'
                room.save()

        return deposit


class PaymentReversalSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, max_length=1000)


class PaymentRefundRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    date = serializers.DateField()
    method = serializers.ChoiceField(choices=['mpesa', 'cash', 'bank'])
    reference = serializers.CharField(max_length=100)
    reason = serializers.CharField(min_length=3, max_length=1000)

    def validate_reference(self, value):
        value = value.strip()
        if PaymentRefund.objects.filter(reference=value).exists():
            raise serializers.ValidationError('This refund reference has already been recorded.')
        return value


class ReservationReleaseSerializer(serializers.Serializer):
    reservationId = serializers.IntegerField()
    reason = serializers.CharField(min_length=3, max_length=1000)
