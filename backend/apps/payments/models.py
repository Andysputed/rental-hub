from django.db import models
from decimal import Decimal
from apps.properties.models import Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge


class Payment(models.Model):
    METHOD_CHOICES = (
        ('mpesa', 'M-Pesa'),
        ('cash', 'Cash'),
        ('bank', 'Bank Transfer'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name='payments')
    tenancy = models.ForeignKey(Tenancy, on_delete=models.PROTECT, related_name='payments')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='payments')
    charge = models.ForeignKey(RentCharge, on_delete=models.PROTECT, null=True, blank=True, related_name='payments')
    receipt_number = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='mpesa')
    reference = models.CharField(max_length=100, unique=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='payment_amount_positive')]

    def __str__(self):
        return f"{self.receipt_number} - {self.amount} KES ({self.method})"


class PaymentAllocation(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='allocations')
    charge = models.ForeignKey(RentCharge, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='allocation_amount_positive')]

    def __str__(self):
        return f"Allocated {self.amount} from {self.payment.receipt_number} to {self.charge}"


class Deposit(models.Model):
    STATUS_CHOICES = (
        ('unpaid', 'Unpaid'),
        ('partially_paid', 'Partially Paid'),
        ('held', 'Held'),
        ('waived', 'Waived'),
        ('settled', 'Settled'),
        ('refunded', 'Refunded'),
        ('applied', 'Applied to Rent'),
    )

    tenancy = models.ForeignKey(Tenancy, on_delete=models.PROTECT, related_name='deposits')
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name='deposits')
    required_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    received_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='held')
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    # Waived deposit tracking
    is_waived = models.BooleanField(default=False)
    waived_reason = models.TextField(blank=True, default='')
    waived_at = models.DateTimeField(null=True, blank=True)

    # Financial settlement & audit fields
    rent_deducted = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    repairs_deducted = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    refund_method = models.CharField(max_length=20, choices=Payment.METHOD_CHOICES, blank=True)
    refund_reference = models.CharField(max_length=100, blank=True)
    refund_date = models.DateField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    settlement_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gte=0), name='deposit_amount_nonnegative'),
            models.CheckConstraint(condition=models.Q(required_amount__gte=0), name='deposit_required_amount_nonnegative'),
        ]

    def __str__(self):
        return f"Deposit {self.amount} KES ({self.tenant.full_name}) - {self.get_status_display()}"

    @property
    def total_paid(self):
        payments_sum = self.payments.aggregate(total=models.Sum('amount'))['total']
        if payments_sum is not None:
            return payments_sum
        return self.amount

    @property
    def outstanding_balance(self):
        if self.is_waived or self.status in ('settled', 'refunded', 'applied'):
            return Decimal('0.00')
        req = self.required_amount if self.required_amount > Decimal('0.00') else self.amount
        return max(Decimal('0.00'), req - self.total_paid)

    @property
    def total_deductions(self):
        return self.rent_deducted + self.repairs_deducted

    @property
    def refundable_balance(self):
        return max(Decimal('0.00'), self.amount - self.total_deductions)


class DepositPayment(models.Model):
    deposit = models.ForeignKey(Deposit, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    method = models.CharField(max_length=20, choices=Payment.METHOD_CHOICES, default='mpesa')
    reference = models.CharField(max_length=100)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='deposit_payment_amount_positive'),
        ]

    def __str__(self):
        return f"Deposit Payment {self.amount} KES for {self.deposit.tenant.full_name} ({self.reference})"


class ReceiptSequence(models.Model):
    """Transactional yearly receipt counter; the unique year row serializes issuers."""
    year = models.PositiveSmallIntegerField(unique=True)
    next_number = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(next_number__gte=1), name='receipt_sequence_positive')]


class DepositDeduction(models.Model):
    DEDUCTION_TYPE_CHOICES = (
        ('rent', 'Unpaid Rent'),
        ('repair', 'Repairs & Damages'),
        ('cleaning', 'Cleaning'),
        ('other', 'Other'),
    )

    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE, related_name='deductions')
    deduction_type = models.CharField(max_length=20, choices=DEDUCTION_TYPE_CHOICES)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    charge = models.ForeignKey(RentCharge, on_delete=models.SET_NULL, null=True, blank=True, related_name='deposit_deductions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='deposit_deduction_amount_positive')]

    def __str__(self):
        return f"{self.get_deduction_type_display()}: {self.amount} KES ({self.description})"


class FutureRentReservation(models.Model):
    """Auditable portion of a receipt intentionally held for a future rent month."""
    STATUS_CHOICES = (('reserved', 'Reserved'), ('applied', 'Applied'), ('released', 'Released'), ('reversed', 'Reversed'))
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name='reservations')
    tenancy = models.ForeignKey(Tenancy, on_delete=models.PROTECT, related_name='rent_reservations')
    month = models.CharField(max_length=7)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    applied_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    released_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='reserved')
    charge = models.ForeignKey(RentCharge, on_delete=models.PROTECT, null=True, blank=True, related_name='reservations')
    release_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['month', 'created_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['payment', 'month'], name='unique_payment_future_rent_month'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='future_reservation_amount_positive'),
            models.CheckConstraint(condition=models.Q(applied_amount__gte=0), name='future_reservation_applied_nonnegative'),
            models.CheckConstraint(condition=models.Q(released_amount__gte=0), name='future_reservation_released_nonnegative'),
            models.CheckConstraint(condition=models.Q(applied_amount__lte=models.F('amount')), name='future_reservation_applied_lte_amount'),
            models.CheckConstraint(condition=models.Q(released_amount__lte=models.F('amount') - models.F('applied_amount')), name='future_reservation_released_lte_remaining'),
        ]

    @property
    def remaining_amount(self):
        return self.amount - self.applied_amount - self.released_amount


class PaymentReversal(models.Model):
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name='reversal')
    reason = models.TextField()
    actor = models.ForeignKey('auth.User', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)


class ReversedAllocation(models.Model):
    reversal = models.ForeignKey(PaymentReversal, on_delete=models.PROTECT, related_name='allocations')
    allocation = models.OneToOneField(PaymentAllocation, on_delete=models.PROTECT, related_name='reversal_entry')
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='reversed_allocation_amount_positive')]


class ReversedReservation(models.Model):
    reversal = models.ForeignKey(PaymentReversal, on_delete=models.PROTECT, related_name='reservations')
    reservation = models.OneToOneField(FutureRentReservation, on_delete=models.PROTECT, related_name='reversal_entry')
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='reversed_reservation_amount_positive')]


class PaymentRefund(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name='refunds')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    method = models.CharField(max_length=20, choices=Payment.METHOD_CHOICES)
    reference = models.CharField(max_length=100, unique=True)
    reason = models.TextField()
    actor = models.ForeignKey('auth.User', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'created_at']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='payment_refund_amount_positive')]
