from datetime import date
from decimal import Decimal
import calendar
from django.db import transaction
from django.db.models import Q
from apps.properties.models import Property
from apps.properties.services import get_default_property
from apps.tenants.models import Tenancy
from .models import RentCharge
from apps.payments.ledger import apply_month_reservations, apply_available_advance_credit


@transaction.atomic
def generate_tenancy_month_charge(tenancy, month):
    """Create one tenancy/month charge idempotently and reconcile its rent credits."""
    year_str, month_str = month.split('-')
    year, month_num = int(year_str), int(month_str)
    month_start = date(year, month_num, 1)
    days_in_month = calendar.monthrange(year, month_num)[1]
    month_end = date(year, month_num, days_in_month)
    tenancy = Tenancy.objects.select_for_update().select_related('room', 'tenant').get(pk=tenancy.pk)
    if tenancy.start_date > month_end or (tenancy.end_date and tenancy.end_date < month_start):
        return None, False
    due_day = min(tenancy.rent_due_day, days_in_month)
    due_date = date(year, month_num, due_day)
    charge, created = RentCharge.objects.get_or_create(
        tenancy=tenancy,
        month=month,
        defaults={
            'room': tenancy.room,
            'due_date': due_date,
            'amount': tenancy.monthly_rent,
            'paid_amount': Decimal('0.00'),
            'status': 'unpaid',
        },
    )
    if created:
        charge.update_status()
        charge.save()
    apply_month_reservations(charge)
    apply_available_advance_credit(charge)
    return charge, created


def generate_monthly_charges(month: str, property_obj: Property = None):
    """
    Generate rent charges for all active tenancies for the given month (e.g. '2026-10').
    Vacant rooms without active tenancies are skipped.
    Duplicate charges for the same tenancy and month are prevented.
    Returns (created_count, skipped_count, total_amount).
    """
    if not property_obj:
        property_obj = get_default_property()

    year_str, month_str = month.split('-')
    year, month_num = int(year_str), int(month_str)
    month_start = date(year, month_num, 1)
    max_days = calendar.monthrange(year, month_num)[1]
    month_end = date(year, month_num, max_days)

    active_tenancies = Tenancy.objects.filter(
        room__property=property_obj,
        status='active',
        start_date__lte=month_end,
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=month_start)
    ).select_related('room', 'tenant').order_by('id')

    created_count = 0
    skipped_count = 0
    total_amount = Decimal('0.00')

    with transaction.atomic():
        for tenancy in active_tenancies.select_for_update():
            charge, was_created = generate_tenancy_month_charge(tenancy, month)
            if not was_created:
                skipped_count += 1
                continue

            created_count += 1
            total_amount += charge.amount

    return created_count, skipped_count, total_amount
