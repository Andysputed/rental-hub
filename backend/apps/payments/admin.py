from django.contrib import admin
from .models import Payment, PaymentAllocation, Deposit, DepositDeduction

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('receipt_number', 'tenant', 'room', 'amount', 'date', 'method', 'reference')
    search_fields = ('receipt_number', 'reference', 'tenant__full_name')
    list_filter = ('method', 'date')
    readonly_fields = tuple(field.name for field in Payment._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(PaymentAllocation)
class PaymentAllocationAdmin(admin.ModelAdmin):
    list_display = ('payment', 'charge', 'amount', 'created_at')
    readonly_fields = tuple(field.name for field in PaymentAllocation._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

class DepositDeductionInline(admin.TabularInline):
    model = DepositDeduction
    extra = 0
    can_delete = False
    readonly_fields = tuple(field.name for field in DepositDeduction._meta.fields if field.name != 'deposit')

    def has_add_permission(self, request, obj=None):
        return False

@admin.register(Deposit)
class DepositAdmin(admin.ModelAdmin):
    list_display = ('id', 'tenant', 'amount', 'received_date', 'status', 'rent_deducted', 'repairs_deducted', 'refund_amount')
    list_filter = ('status', 'received_date')
    search_fields = ('tenant__full_name', 'reference', 'refund_reference')
    inlines = [DepositDeductionInline]
    readonly_fields = tuple(field.name for field in Deposit._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(DepositDeduction)
class DepositDeductionAdmin(admin.ModelAdmin):
    list_display = ('deposit', 'deduction_type', 'amount', 'description', 'created_at')
    list_filter = ('deduction_type',)
    readonly_fields = tuple(field.name for field in DepositDeduction._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
