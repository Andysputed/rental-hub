from django.db import models
from decimal import Decimal
from apps.properties.models import Property


class Expense(models.Model):
    CATEGORY_CHOICES = (
        ('maintenance', 'Maintenance'),
        ('utilities', 'Utilities'),
        ('cleaning', 'Cleaning'),
    )

    METHOD_CHOICES = (
        ('mpesa', 'M-Pesa'),
        ('cash', 'Cash'),
        ('bank', 'Bank Transfer'),
    )

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='expenses')
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    title = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='cash')
    reference = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=Decimal('0.00')), name='expense_amount_positive')]

    def __str__(self):
        return f"{self.title} ({self.amount} KES - {self.get_category_display()})"
