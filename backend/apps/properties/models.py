from django.db import models
from decimal import Decimal


class Property(models.Model):
    name = models.CharField(max_length=100, default='Acacia House')
    location = models.CharField(max_length=200, default='Nairobi')
    currency = models.CharField(max_length=10, default='KES')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Properties'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.location})"


class PropertySettings(models.Model):
    property = models.OneToOneField(Property, on_delete=models.CASCADE, related_name='settings')
    landlord_name = models.CharField(max_length=100, default='Veronicah K.')
    landlord_initials = models.CharField(max_length=10, default='VK')
    landlord_phone = models.CharField(max_length=30, blank=True, default='')
    landlord_email = models.EmailField(max_length=254, blank=True, default='')
    default_due_day = models.PositiveSmallIntegerField(default=5)
    auto_generate_charges = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Property Settings'

    def __str__(self):
        return f"Settings for {self.property.name}"


class Room(models.Model):
    STATUS_CHOICES = (
        ('vacant', 'Vacant'),
        ('occupied', 'Occupied'),
    )

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='rooms')
    number = models.CharField(max_length=10)  # e.g. "01", "02"
    name = models.CharField(max_length=50)    # e.g. "Room 01"
    default_rent = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('10000.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='vacant')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['number']
        constraints = [
            models.UniqueConstraint(fields=['property', 'number'], name='unique_room_number_per_property')
        ]

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    def get_current_tenancy(self):
        """Returns the active tenancy if one exists."""
        return self.tenancies.filter(status='active').first()
