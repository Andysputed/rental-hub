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

    def __str__(self):
        return f"{self.receipt_number} - {self.amount} KES ({self.method})"


class PaymentAllocation(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='allocations')
    charge = models.ForeignKey(RentCharge, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Allocated {self.amount} from {self.payment.receipt_number} to {self.charge}"


class Deposit(models.Model):
    STATUS_CHOICES = (
        ('held', 'Held'),
        ('refunded', 'Refunded'),
        ('applied', 'Applied to Rent'),
    )

    tenancy = models.ForeignKey(Tenancy, on_delete=models.PROTECT, related_name='deposits')
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name='deposits')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    received_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='held')
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-received_date']

    def __str__(self):
        return f"Deposit {self.amount} KES ({self.tenant.full_name}) - {self.get_status_display()}"
