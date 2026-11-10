from django.db import models
from decimal import Decimal
from apps.properties.models import Room
from apps.tenants.models import Tenancy


class RentCharge(models.Model):
    STATUS_CHOICES = (
        ('unpaid', 'Unpaid'),
        ('partial', 'Partial'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
    )

    tenancy = models.ForeignKey(Tenancy, on_delete=models.PROTECT, related_name='charges')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='charges')
    month = models.CharField(max_length=7)  # Format: "YYYY-MM", e.g. "2026-10"
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unpaid')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month', 'room__number']
        constraints = [
            # Prevent duplicate charges for the same tenancy and billing month
            models.UniqueConstraint(
                fields=['tenancy', 'month'],
                name='unique_rent_charge_per_tenancy_month'
            ),
            models.CheckConstraint(condition=models.Q(amount__gt=Decimal('0.00')), name='rent_charge_amount_positive'),
            models.CheckConstraint(condition=models.Q(paid_amount__gte=Decimal('0.00')), name='rent_charge_paid_nonnegative'),
        ]

    def __str__(self):
        return f"{self.room.name} - {self.month} ({self.amount} KES)"

    @property
    def balance(self):
        return max(Decimal('0.00'), self.amount - self.paid_amount)

    def update_status(self):
        """Update charge status based on paid_amount and due_date."""
        from django.utils import timezone
        today = timezone.now().date()
        if self.paid_amount >= self.amount:
            self.status = 'paid'
        elif self.paid_amount > Decimal('0.00'):
            self.status = 'partial' if today <= self.due_date else 'overdue'
        else:
            self.status = 'unpaid' if today <= self.due_date else 'overdue'
