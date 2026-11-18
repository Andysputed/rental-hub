"""Destructive helpers for the isolated staging dataset.

Callers must run config.staging_guard.assert_staging() first.
"""
from django.db import transaction

from apps.expenses.models import Expense
from apps.payments.models import (
    Deposit,
    DepositDeduction,
    DepositPayment,
    FutureRentReservation,
    Payment,
    PaymentAllocation,
    PaymentRefund,
    PaymentReversal,
    ReceiptSequence,
    ReversedAllocation,
    ReversedReservation,
)
from apps.properties.models import Property, PropertySettings, Room
from apps.rent.models import RentCharge
from apps.tenants.models import Tenancy, Tenant


@transaction.atomic
def wipe_staging_data() -> dict:
    """Delete all RentalHub business data in FK-safe order. Keeps auth users."""
    counts = {}
    for model in (
        ReversedAllocation, ReversedReservation, PaymentReversal, PaymentRefund,
        FutureRentReservation, PaymentAllocation, DepositDeduction, DepositPayment,
        Deposit, Payment, RentCharge, Tenancy, Tenant, Expense, Room,
        PropertySettings, Property, ReceiptSequence,
    ):
        deleted, _ = model.objects.all().delete()
        counts[model.__name__] = deleted
    return counts
