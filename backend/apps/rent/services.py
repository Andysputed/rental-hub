from datetime import date
from decimal import Decimal
import calendar
from django.db import transaction
from apps.properties.models import Property
from apps.tenants.models import Tenancy
from .models import RentCharge


def generate_monthly_charges(month: str, property_obj: Property = None):
    """
    Generate rent charges for all active tenancies for the given month (e.g. '2026-10').
    Vacant rooms without active tenancies are skipped.
    Duplicate charges for the same tenancy and month are prevented.
    Returns (created_count, skipped_count, total_amount).
    """
    if not property_obj:
        property_obj = Property.objects.first()

    year_str, month_str = month.split('-')
    year, month_num = int(year_str), int(month_str)

    active_tenancies = Tenancy.objects.filter(
        room__property=property_obj,
        status='active'
    ).select_related('room', 'tenant')

    created_count = 0
    skipped_count = 0
    total_amount = Decimal('0.00')

    with transaction.atomic():
        for tenancy in active_tenancies:
            # Check if charge already exists for this tenancy and month
            if RentCharge.objects.filter(tenancy=tenancy, month=month).exists():
                skipped_count += 1
                continue

            # Calculate due date: clamp due day to days in month
            max_days = calendar.monthrange(year, month_num)[1]
            due_day = min(tenancy.rent_due_day, max_days)
            due_date = date(year, month_num, due_day)

            # Use agreed tenancy rent
            charge_amount = tenancy.monthly_rent

            charge = RentCharge.objects.create(
                tenancy=tenancy,
                room=tenancy.room,
                month=month,
                due_date=due_date,
                amount=charge_amount,
                paid_amount=Decimal('0.00'),
                status='unpaid'
            )
            charge.update_status()
            charge.save()

            created_count += 1
            total_amount += charge_amount

    return created_count, skipped_count, total_amount
