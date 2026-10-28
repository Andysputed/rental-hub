from django.contrib import admin
from .models import Payment, PaymentAllocation, Deposit, DepositDeduction

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('receipt_number', 'tenant', 'room', 'amount', 'date', 'method', 'reference')
    search_fields = ('receipt_number', 'reference', 'tenant__full_name')
    list_filter = ('method', 'date')

@admin.register(PaymentAllocation)
class PaymentAllocationAdmin(admin.ModelAdmin):
    list_display = ('payment', 'charge', 'amount', 'created_at')

class DepositDeductionInline(admin.TabularInline):
    model = DepositDeduction
    extra = 0

@admin.register(Deposit)
class DepositAdmin(admin.ModelAdmin):
    list_display = ('id', 'tenant', 'amount', 'received_date', 'status', 'rent_deducted', 'repairs_deducted', 'refund_amount')
    list_filter = ('status', 'received_date')
    search_fields = ('tenant__full_name', 'reference', 'refund_reference')
    inlines = [DepositDeductionInline]

@admin.register(DepositDeduction)
class DepositDeductionAdmin(admin.ModelAdmin):
    list_display = ('deposit', 'deduction_type', 'amount', 'description', 'created_at')
    list_filter = ('deduction_type',)
