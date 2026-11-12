from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, F, ExpressionWrapper, DecimalField

from apps.rent.models import RentCharge
from .models import (
    FutureRentReservation, PaymentAllocation, PaymentRefund, PaymentReversal,
    ReversedAllocation, ReversedReservation,
)

ZERO = Decimal('0.00')


def payment_available_credit(payment, *, lock=False):
    """Return receipt funds not allocated, reserved, refunded or reversed."""
    if PaymentReversal.objects.filter(payment=payment).exists():
        return ZERO
    allocations = PaymentAllocation.objects.filter(payment=payment).exclude(
        reversal_entry__isnull=False
    ).aggregate(total=Sum('amount'))['total'] or ZERO
    reservations = payment.reservations.filter(status='reserved').aggregate(
        total=Sum(ExpressionWrapper(
            F('amount') - F('applied_amount') - F('released_amount'),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ))
    )['total'] or ZERO
    refunds = PaymentRefund.objects.filter(payment=payment).aggregate(total=Sum('amount'))['total'] or ZERO
    return payment.amount - allocations - reservations - refunds


@transaction.atomic
def apply_month_reservations(charge):
    """Consume reservations once when a real eligible rent charge exists."""
    charge = RentCharge.objects.select_for_update().select_related('tenancy').get(pk=charge.pk)
    if charge.month < charge.tenancy.start_date.strftime('%Y-%m'):
        return ZERO
    reservations = list(FutureRentReservation.objects.select_for_update().filter(
        tenancy=charge.tenancy, month=charge.month, status='reserved'
    ).select_related('payment').order_by('created_at', 'id'))
    remaining = charge.balance
    applied_total = ZERO
    for reservation in reservations:
        if remaining <= ZERO:
            break
        payment = reservation.payment
        if PaymentReversal.objects.filter(payment=payment).exists():
            reservation.status = 'reversed'
            reservation.released_amount = reservation.amount - reservation.applied_amount
            reservation.save(update_fields=['status', 'released_amount', 'updated_at'])
            continue
        to_apply = min(reservation.remaining_amount, remaining)
        if to_apply <= ZERO:
            continue
        PaymentAllocation.objects.create(payment=payment, charge=charge, amount=to_apply)
        charge.paid_amount += to_apply
        reservation.applied_amount += to_apply
        remaining -= to_apply
        applied_total += to_apply
        if reservation.remaining_amount > ZERO:
            # Excess cannot remain reserved against a fully satisfied charge.
            reservation.released_amount += reservation.remaining_amount
        reservation.charge = charge
        reservation.status = 'applied' if reservation.remaining_amount == ZERO else 'released'
        reservation.save(update_fields=['applied_amount', 'released_amount', 'charge', 'status', 'updated_at'])
    if applied_total:
        charge.update_status()
        charge.save(update_fields=['paid_amount', 'status', 'updated_at'])
    return applied_total


@transaction.atomic
def apply_available_advance_credit(charge):
    """
    Apply any unallocated advance credit from prior payments belonging to
    this tenancy to an eligible rent charge.
    Allocates chronologically from the oldest available payment.
    """
    from .models import Payment
    charge = RentCharge.objects.select_for_update().select_related('tenancy').get(pk=charge.pk)
    if charge.balance <= ZERO:
        return ZERO
    if charge.month < charge.tenancy.start_date.strftime('%Y-%m'):
        return ZERO
    if charge.reservations.filter(status='applied').exists():
        return ZERO

    reversed_ids = PaymentReversal.objects.values_list('payment_id', flat=True)
    payments = list(
        Payment.objects.select_for_update()
        .filter(tenancy=charge.tenancy)
        .exclude(id__in=reversed_ids)
        .order_by('date', 'id')
    )

    applied_total = ZERO
    for payment in payments:
        if charge.balance <= ZERO:
            break
        credit = payment_available_credit(payment)
        if credit <= ZERO:
            continue
        to_apply = min(credit, charge.balance)
        if to_apply <= ZERO:
            continue
        PaymentAllocation.objects.create(payment=payment, charge=charge, amount=to_apply)
        charge.paid_amount += to_apply
        charge.update_status()
        charge.save(update_fields=['paid_amount', 'status', 'updated_at'])
        applied_total += to_apply

    return applied_total


@transaction.atomic
def reconcile_tenancy_advance_credit(tenancy):
    """
    Apply any available unallocated credit on a tenancy to its unpaid charges,
    ordered chronologically (oldest charge first).
    """
    unpaid_charges = list(
        RentCharge.objects.select_for_update()
        .filter(tenancy=tenancy, paid_amount__lt=F('amount'))
        .order_by('month', 'due_date', 'id')
    )
    total_reconciled = ZERO
    for charge in unpaid_charges:
        total_reconciled += apply_available_advance_credit(charge)
    return total_reconciled


@transaction.atomic
def reverse_payment(payment, reason, actor=None):
    """Full, one-time reversal preserving original receipt and allocation rows."""
    from django.core.exceptions import ValidationError
    from .models import Payment

    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if PaymentReversal.objects.filter(payment=payment).exists():
        raise ValidationError('This payment has already been reversed.')
    if PaymentRefund.objects.filter(payment=payment).exists():
        raise ValidationError('A refunded payment cannot be fully reversed; record a correction separately.')
    allocations = list(PaymentAllocation.objects.select_for_update().filter(payment=payment).select_related('charge'))
    reservations = list(FutureRentReservation.objects.select_for_update().filter(payment=payment))
    reversal = PaymentReversal.objects.create(payment=payment, reason=reason, actor=actor)
    for allocation in allocations:
        charge = RentCharge.objects.select_for_update().get(pk=allocation.charge_id)
        if charge.paid_amount < allocation.amount:
            raise ValidationError('Charge balance is inconsistent; reversal was stopped.')
        ReversedAllocation.objects.create(reversal=reversal, allocation=allocation, amount=allocation.amount)
        charge.paid_amount -= allocation.amount
        charge.update_status()
        charge.save(update_fields=['paid_amount', 'status', 'updated_at'])
    for reservation in reservations:
        remaining = reservation.remaining_amount
        if remaining > ZERO:
            ReversedReservation.objects.create(reversal=reversal, reservation=reservation, amount=remaining)
            reservation.released_amount += remaining
            reservation.status = 'reversed'
            reservation.save(update_fields=['released_amount', 'status', 'updated_at'])
    return reversal


@transaction.atomic
def create_payment_refund(payment, *, amount, date, method, reference, reason, actor=None):
    from django.core.exceptions import ValidationError
    from .models import Payment

    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if PaymentReversal.objects.filter(payment=payment).exists():
        raise ValidationError('A reversed payment cannot be refunded.')
    if amount <= ZERO or amount > payment_available_credit(payment):
        raise ValidationError('Refund cannot exceed this payment’s available unallocated credit.')
    return PaymentRefund.objects.create(
        payment=payment, amount=amount, date=date, method=method,
        reference=reference, reason=reason, actor=actor,
    )
