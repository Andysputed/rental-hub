from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db.models import Sum
from django.conf import settings as django_settings
from apps.properties.models import Property, Room
from apps.properties.services import get_default_property
from apps.tenants.models import Tenancy
from apps.rent.models import RentCharge
from apps.payments.models import Payment, PaymentRefund
from apps.expenses.models import Expense


def get_dashboard_metrics(month: str, property_obj: Property = None):
    """
    Compute real-time aggregated metrics for the dashboard.
    Reconciles directly against recorded database ledgers.
    """
    if not property_obj:
        property_obj = get_default_property()

    today = timezone.now().date()
    year_str, month_str = month.split('-')
    year, month_num = int(year_str), int(month_str)

    # 1. Rooms & Occupancy
    rooms = list(Room.objects.filter(property=property_obj).order_by('number'))
    total_rooms = len(rooms)
    occupied_rooms = sum(1 for r in rooms if r.status == 'occupied')
    vacant_rooms = total_rooms - occupied_rooms
    occupancy_rate = round((occupied_rooms / total_rooms * 100)) if total_rooms > 0 else 0
    potential_rent = sum(r.default_rent for r in rooms)

    room_badges = [
        {
            'id': r.id,
            'number': r.number,
            'name': r.name,
            'status': r.status,
            'isOccupied': r.status == 'occupied',
        }
        for r in rooms
    ]

    # 2. Monthly Rent Charges & Collections
    charges = RentCharge.objects.filter(
        room__property=property_obj,
        month=month
    ).select_related('room', 'tenancy__tenant')

    total_rent_charged = sum((c.amount for c in charges), Decimal('0.00'))
    total_rent_received = Payment.objects.filter(
        room__property=property_obj, date__year=year, date__month=month_num
    ).exclude(reversal__isnull=False).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    total_refunds = PaymentRefund.objects.filter(
        payment__room__property=property_obj, date__year=year, date__month=month_num
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    total_outstanding = sum((c.balance for c in charges), Decimal('0.00'))
    current_tenants_outstanding = sum(
        (c.balance for c in charges if c.tenancy.status == 'active'), Decimal('0.00')
    )
    former_tenants_outstanding = sum(
        (c.balance for c in charges if c.tenancy.status == 'ended'), Decimal('0.00')
    )

    collection_rate = (
        round(float(total_rent_received / total_rent_charged * 100))
        if total_rent_charged > Decimal('0.00')
        else 0
    )

    # 3. Monthly Expenses
    expenses = Expense.objects.filter(
        property=property_obj,
        date__year=year,
        date__month=month_num
    )
    total_expenses = sum((e.amount for e in expenses), Decimal('0.00'))
    net_cash_income = total_rent_received - total_refunds - total_expenses

    # 4. Overdue charges (Needs Attention)
    overdue_items = []
    for c in charges:
        if c.balance > Decimal('0.00') and c.due_date <= today:
            days_overdue = max(0, (today - c.due_date).days) if today > c.due_date else 0
            overdue_items.append({
                'chargeId': c.id,
                'tenancyId': c.tenancy.id,
                'tenancyStatus': c.tenancy.status,
                'isFormerTenant': c.tenancy.status == 'ended',
                'roomId': c.room.id,
                'roomName': c.room.name,
                'tenantName': c.tenancy.tenant.full_name,
                'tenantPhone': c.tenancy.tenant.phone,
                'amount': float(c.amount),
                'paidAmount': float(c.paid_amount),
                'balance': float(c.balance),
                'dueDate': str(c.due_date),
                'daysOverdue': days_overdue,
                'status': c.status,
            })
    overdue_items.sort(key=lambda x: x['balance'], reverse=True)

    # 5. Recent Payments
    recent_payments_qs = Payment.objects.filter(
        room__property=property_obj
    ).select_related('tenant', 'room').order_by('-date', '-created_at')[:5]

    recent_payments = [
        {
            'id': p.id,
            'receiptNumber': p.receipt_number,
            'tenantName': p.tenant.full_name,
            'roomName': p.room.name,
            'amount': float(p.amount),
            'date': str(p.date),
            'method': p.method,
            'reference': p.reference,
        }
        for p in recent_payments_qs
    ]

    return {
        'month': month,
        'propertyName': property_obj.name,
        'totalRentCharged': float(total_rent_charged),
        'totalRentReceived': float(total_rent_received),
        'totalRefunds': float(total_refunds),
        'totalOutstanding': float(total_outstanding),
        'currentTenantsOutstanding': float(current_tenants_outstanding),
        'formerTenantsOutstanding': float(former_tenants_outstanding),
        'totalExpenses': float(total_expenses),
        'netCashIncome': float(net_cash_income),
        'collectionRate': collection_rate,
        'occupancy': {
            'totalRooms': total_rooms,
            'occupiedCount': occupied_rooms,
            'vacantCount': vacant_rooms,
            'occupancyPercentage': occupancy_rate,
            'rooms': room_badges,
            'potentialRent': float(potential_rent),
        },
        'overdueCount': len(overdue_items),
        'needsAttention': overdue_items,
        'recentPayments': recent_payments,
    }


def get_monthly_financial_report(month: str, property_obj: Property = None):
    """
    Generate comprehensive cash-basis monthly financial report.
    Reconciles cash received against operational expenses and ledger balances.
    """
    if not property_obj:
        property_obj = get_default_property()

    today = timezone.now().date()
    year_str, month_str = month.split('-')
    year, month_num = int(year_str), int(month_str)

    # 1. Rooms & Potential
    rooms = list(Room.objects.filter(property=property_obj).order_by('number'))
    total_rooms = len(rooms)
    occupied_rooms = sum(1 for r in rooms if r.status == 'occupied')
    occupancy_percentage = round((occupied_rooms / total_rooms * 100)) if total_rooms > 0 else 0
    potential_rent = sum(r.default_rent for r in rooms)

    # 2. Charges and Collections
    charges = RentCharge.objects.filter(
        room__property=property_obj,
        month=month
    ).select_related('room', 'tenancy__tenant')

    rent_charged = sum((c.amount for c in charges), Decimal('0.00'))
    rent_received = Payment.objects.filter(
        room__property=property_obj, date__year=year, date__month=month_num
    ).exclude(reversal__isnull=False).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    rent_refunded = PaymentRefund.objects.filter(
        payment__room__property=property_obj, date__year=year, date__month=month_num
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    outstanding_rent = sum((c.balance for c in charges), Decimal('0.00'))
    current_tenants_outstanding = sum(
        (c.balance for c in charges if c.tenancy.status == 'active'), Decimal('0.00')
    )
    former_tenants_outstanding = sum(
        (c.balance for c in charges if c.tenancy.status == 'ended'), Decimal('0.00')
    )
    collection_rate = (
        round(float(rent_received / rent_charged * 100))
        if rent_charged > Decimal('0.00')
        else 0
    )

    # 3. Expenses
    expenses = Expense.objects.filter(
        property=property_obj,
        date__year=year,
        date__month=month_num
    ).order_by('-date', '-created_at')

    total_expenses = sum((e.amount for e in expenses), Decimal('0.00'))
    net_cash_income = rent_received - rent_refunded - total_expenses

    # Categories breakdown
    categories = {'maintenance': Decimal('0.00'), 'utilities': Decimal('0.00'), 'cleaning': Decimal('0.00')}
    expense_list = []
    for exp in expenses:
        categories[exp.category] = categories.get(exp.category, Decimal('0.00')) + exp.amount
        expense_list.append({
            'id': exp.id,
            'category': exp.category,
            'title': exp.title,
            'amount': float(exp.amount),
            'date': str(exp.date),
            'method': exp.method,
            'reference': exp.reference,
            'description': exp.description,
        })

    # 4. Outstanding & Overdue list
    overdue_items = []
    for c in charges:
        if c.balance > Decimal('0.00') and c.due_date <= today:
            days_overdue = max(0, (today - c.due_date).days) if today > c.due_date else 0
            overdue_items.append({
                'id': c.id,
                'tenancyId': c.tenancy.id,
                'tenancyStatus': c.tenancy.status,
                'isFormerTenant': c.tenancy.status == 'ended',
                'roomName': c.room.name,
                'tenantName': c.tenancy.tenant.full_name,
                'amount': float(c.amount),
                'paidAmount': float(c.paid_amount),
                'balance': float(c.balance),
                'dueDate': str(c.due_date),
                'daysOverdue': days_overdue,
            })
    overdue_items.sort(key=lambda x: x['balance'], reverse=True)

    return {
        'month': month,
        'asOfDate': str(today),
        'property': {
            'name': property_obj.name,
            'location': property_obj.location,
            'currency': property_obj.currency,
        },
        'summary': {
            'rentCharged': float(rent_charged),
            'rentReceived': float(rent_received),
            'rentRefunded': float(rent_refunded),
            'outstandingRent': float(outstanding_rent),
            'currentTenantsOutstanding': float(current_tenants_outstanding),
            'formerTenantsOutstanding': float(former_tenants_outstanding),
            'totalExpenses': float(total_expenses),
            'netCashIncome': float(net_cash_income),
            'collectionRate': collection_rate,
            'occupancyPercentage': occupancy_percentage,
            'occupiedRooms': occupied_rooms,
            'totalRooms': total_rooms,
            'potentialFullOccupancy': float(potential_rent),
        },
        'cashMovement': {
            'rentReceived': float(rent_received),
            'rentRefunded': float(rent_refunded),
            'expenses': float(total_expenses),
            'netCashIncome': float(net_cash_income),
        },
        'expenseBreakdown': {
            'total': float(total_expenses),
            'byCategory': {cat: float(amt) for cat, amt in categories.items()},
            'items': expense_list,
        },
        'outstandingBalances': {
            'total': float(outstanding_rent),
            'count': len(overdue_items),
            'items': overdue_items,
        },
        'reconciliationNotes': (
            "Cash-basis report. Outstanding rent is not cash received. "
            "Security deposits are recorded separately and excluded from rental revenue."
        )
    }
