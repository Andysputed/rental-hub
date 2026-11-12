from decimal import Decimal
from django.db import transaction, models
from django.core.exceptions import ValidationError
from .models import Deposit, DepositPayment


@transaction.atomic
def record_deposit_payment(deposit, amount, payment_date, method, reference='', notes=''):
    """
    Record an atomic deposit payment transaction towards a tenancy's deposit obligation.
    Strictly isolated from rent payments and rent allocations.
    """
    deposit = Deposit.objects.select_for_update().get(pk=deposit.pk)

    if deposit.is_waived:
        raise ValidationError('Cannot record a deposit payment for a waived deposit obligation.')

    if deposit.status in ('settled', 'refunded', 'applied'):
        raise ValidationError(f'Cannot record a deposit payment for a {deposit.status} deposit.')

    amount = Decimal(str(amount))
    if amount <= Decimal('0.00'):
        raise ValidationError('Deposit payment amount must be greater than zero.')

    outstanding = deposit.outstanding_balance
    if amount > outstanding:
        raise ValidationError(f'Payment amount ({amount} KES) exceeds outstanding deposit balance ({outstanding} KES).')

    payment = DepositPayment.objects.create(
        deposit=deposit,
        amount=amount,
        payment_date=payment_date,
        method=method,
        reference=reference.strip() if reference else f"DEP-{deposit.tenancy_id}-{deposit.tenancy.room.number}",
        notes=notes.strip() if notes else '',
    )

    # Recalculate deposit held amount
    total_paid = deposit.payments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
    deposit.amount = total_paid
    if not deposit.received_date:
        deposit.received_date = payment_date
    if not deposit.reference:
        deposit.reference = payment.reference

    req = deposit.required_amount if deposit.required_amount > Decimal('0.00') else deposit.amount
    if total_paid >= req:
        deposit.status = 'held'
    elif total_paid > Decimal('0.00'):
        deposit.status = 'partially_paid'
    else:
        deposit.status = 'unpaid'

    deposit.save(update_fields=['amount', 'received_date', 'reference', 'status', 'updated_at'])
    return payment

