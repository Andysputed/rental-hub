from django.db import models
from decimal import Decimal
from apps.properties.models import Room


class Tenant(models.Model):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('former', 'Former'),
    )

    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30)
    email = models.EmailField(blank=True, null=True)
    initials = models.CharField(max_length=10, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['full_name']
        constraints = [models.UniqueConstraint(fields=['phone'], name='unique_tenant_phone')]

    def __str__(self):
        return f"{self.full_name} ({self.phone})"

    def save(self, *args, **kwargs):
        if not self.initials and self.full_name:
            parts = self.full_name.strip().split()
            if len(parts) >= 2:
                self.initials = (parts[0][0] + parts[-1][0]).upper()
            elif len(parts) == 1:
                self.initials = parts[0][:2].upper()
        super().save(*args, **kwargs)


class Tenancy(models.Model):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('ended', 'Ended'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name='tenancies')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='tenancies')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    monthly_rent = models.DecimalField(max_digits=12, decimal_places=2)
    deposit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    rent_due_day = models.PositiveSmallIntegerField(default=5)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date']
        verbose_name_plural = 'Tenancies'
        constraints = [
            # Exactly one active tenancy per room allowed
            models.UniqueConstraint(
                fields=['room'],
                condition=models.Q(status='active'),
                name='unique_active_tenancy_per_room'
            ),
            models.UniqueConstraint(
                fields=['tenant'],
                condition=models.Q(status='active'),
                name='unique_active_tenancy_per_tenant'
            ),
            models.CheckConstraint(condition=models.Q(monthly_rent__gt=Decimal('0.00')), name='tenancy_monthly_rent_positive'),
            models.CheckConstraint(condition=models.Q(deposit__gte=Decimal('0.00')), name='tenancy_deposit_nonnegative'),
            models.CheckConstraint(condition=models.Q(rent_due_day__gte=1, rent_due_day__lte=28), name='tenancy_due_day_between_1_28'),
        ]

    def __str__(self):
        return f"{self.tenant.full_name} -> {self.room.name} ({self.get_status_display()})"
