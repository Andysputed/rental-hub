"""Read-only integrity verification for the isolated staging dataset."""

from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum

from apps.expenses.models import Expense
from apps.payments.ledger import payment_available_credit
from apps.payments.models import Deposit, DepositPayment, Payment, PaymentAllocation
from apps.properties.models import Property, Room
from apps.properties.services import get_default_property
from apps.rent.models import RentCharge
from apps.rent.services import generate_monthly_charges
from apps.reports.services import get_dashboard_metrics, get_monthly_financial_report
from apps.tenants.models import Tenancy
from config.staging_guard import assert_staging

D = Decimal
MONTHS = ('2026-07', '2026-08', '2026-09', '2026-10', '2026-11')


class Command(BaseCommand):
    help = 'Verify staging dataset totals, ledger integrity and report reconciliation.'

    def handle(self, *args, **options):
        assert_staging('verify staging data')
        self.failures = []
        self._check_identity()
        self._check_portfolio()
        self._check_charges()
        self._check_payments()
        self._check_deposits()
        self._check_expenses()
        self._check_idempotency()
        self._check_reports()

        if self.failures:
            raise CommandError(
                f'{len(self.failures)} staging verification check(s) failed: '
                + '; '.join(self.failures)
            )
        self.stdout.write(self.style.SUCCESS('All staging verification checks passed.'))

    def _check(self, label, condition, detail=''):
        ok = bool(condition)
        prefix = 'PASS' if ok else 'FAIL'
        line = f'{prefix} {label}'
        if detail:
            line += f' — {detail}'
        self.stdout.write(line)
        if not ok:
            self.failures.append(label)

    def _check_identity(self):
        db = settings.DATABASES['default']
        host = str(db.get('HOST') or '')
        self.stdout.write(
            f'Staging database: name={db.get("NAME")} host={host} port={db.get("PORT")} '
            f'user={db.get("USER")}'
        )
        self._check(
            'database identity',
            db.get('NAME') == 'rentalhub_staging'
            and str(db.get('PORT')) == '55432'
            and host in {'127.0.0.1', 'localhost', '::1'},
        )
        self._check('staging settings flag', getattr(settings, 'RENTALHUB_STAGING', False))

    def _check_portfolio(self):
        self._check('exactly one property', Property.objects.count() == 1)
        prop = get_default_property()
        rooms = list(Room.objects.filter(property=prop).order_by('number'))
        self._check('six rooms', len(rooms) == 6, f'found {len(rooms)}')
        self._check(
            'five occupied rooms',
            sum(1 for room in rooms if room.status == 'occupied') == 5,
        )
        vacant = [room for room in rooms if room.status == 'vacant']
        self._check(
            'one vacant room (Room 06)',
            len(vacant) == 1 and vacant[0].number == '06',
        )
        self._check(
            'distinct room default rents',
            sorted(room.default_rent for room in rooms)
            == [D('10000'), D('11000'), D('12000'), D('12500'), D('13500'), D('14500')],
        )

        active = list(Tenancy.objects.filter(room__property=prop, status='active'))
        self._check('five active tenancies', len(active) == 5, f'found {len(active)}')
        self._check(
            'five tenants',
            len({tenancy.tenant_id for tenancy in active}) == 5
            and all(t.tenant.phone.startswith('+254 700 000 1') for t in active),
        )
        self._check(
            'differing agreed rents',
            sorted(tenancy.monthly_rent for tenancy in active)
            == [D('11000'), D('12000'), D('12500'), D('13500'), D('14500')],
        )

    def _check_charges(self):
        prop = get_default_property()
        charges = list(RentCharge.objects.filter(room__property=prop))
        self._check('fifteen rent charges', len(charges) == 15, f'found {len(charges)}')
        self._check(
            'charge total 183366.67',
            sum((charge.amount for charge in charges), D('0.00')) == D('183366.67'),
        )
        self._check(
            'charges span July-November 2026',
            {charge.month for charge in charges} == set(MONTHS),
        )
        self._check(
            'vacant Room 06 has no charges',
            not any(charge.room.number == '06' for charge in charges),
        )
        self._check(
            'no duplicate tenancy-month charges',
            len({(charge.tenancy_id, charge.month) for charge in charges}) == len(charges),
        )

        try:
            mid_month = RentCharge.objects.get(
                tenancy__room__number='03', tenancy__room__property=prop, month='2026-09'
            )
        except RentCharge.DoesNotExist:
            self._check('T3 move-in proration', False, 'September charge missing')
        else:
            self._check(
                'T3 move-in proration 5866.67 due 2026-09-15',
                mid_month.amount == D('5866.67') and str(mid_month.due_date) == '2026-09-15',
                f'{mid_month.amount} due {mid_month.due_date}',
            )

        try:
            late_start = RentCharge.objects.get(
                tenancy__room__number='04', tenancy__room__property=prop, month='2026-11'
            )
        except RentCharge.DoesNotExist:
            self._check('T4 November due date', False, 'November charge missing')
        else:
            self._check(
                'T4 November due date 2026-11-05',
                late_start.amount == D('14500') and str(late_start.due_date) == '2026-11-05',
            )

    def _check_payments(self):
        prop = get_default_property()
        payments = list(Payment.objects.filter(room__property=prop))
        self._check('fourteen receipts', len(payments) == 14, f'found {len(payments)}')
        self._check(
            'payment total 143366.67',
            sum((payment.amount for payment in payments), D('0.00')) == D('143366.67'),
        )
        self._check(
            'all payment methods exercised',
            {payment.method for payment in payments} == {'mpesa', 'cash', 'bank'},
        )
        receipts = sorted(payment.receipt_number for payment in payments)
        self._check(
            'sequential receipt numbers RH-2026-001..014',
            receipts == [f'RH-2026-{number:03d}' for number in range(1, 15)],
        )

        allocations = PaymentAllocation.objects.filter(
            payment__in=payments
        ).exclude(reversal_entry__isnull=False)
        allocated = allocations.aggregate(total=Sum('amount'))['total'] or D('0.00')
        self._check('allocated total 142366.67', allocated == D('142366.67'), str(allocated))

        credit = sum((payment_available_credit(payment) for payment in payments), D('0.00'))
        self._check('advance credit 1000.00', credit == D('1000.00'), str(credit))

        charges = RentCharge.objects.filter(room__property=prop)
        outstanding = sum((charge.balance for charge in charges), D('0.00'))
        self._check('outstanding rent 41000.00', outstanding == D('41000.00'), str(outstanding))

        mismatches = []
        for charge in charges:
            active_allocations = sum(
                (allocation.amount for allocation in charge.allocations.exclude(
                    reversal_entry__isnull=False
                )),
                D('0.00'),
            )
            if charge.paid_amount != active_allocations:
                mismatches.append(
                    f'{charge.room.number}/{charge.month}: paid {charge.paid_amount} '
                    f'vs allocated {active_allocations}'
                )
            elif charge.paid_amount > charge.amount:
                mismatches.append(f'{charge.room.number}/{charge.month}: overpaid')
        self._check(
            'charge paid_amount reconciles with allocations',
            not mismatches,
            '; '.join(mismatches[:3]),
        )

    def _check_deposits(self):
        prop = get_default_property()
        deposits = list(Deposit.objects.filter(tenancy__room__property=prop))
        self._check('five deposits', len(deposits) == 5, f'found {len(deposits)}')
        self._check(
            'deposit required total 63500.00',
            sum((deposit.required_amount for deposit in deposits), D('0.00')) == D('63500.00'),
        )
        self._check(
            'deposit held total 45000.00',
            sum((deposit.amount for deposit in deposits), D('0.00')) == D('45000.00'),
        )
        self._check(
            'deposit outstanding 18500.00',
            sum((deposit.outstanding_balance for deposit in deposits), D('0.00')) == D('18500.00'),
        )
        deposit_payments = DepositPayment.objects.filter(deposit__in=deposits)
        self._check('five deposit payments', deposit_payments.count() == 5)
        self._check(
            'deposit payments total 45000.00',
            deposit_payments.aggregate(total=Sum('amount'))['total'] == D('45000.00'),
        )
        self._check(
            'deposits kept out of rent receipts',
            Payment.objects.filter(room__property=prop).count() == 14
            and not Payment.objects.filter(reference__startswith='STG-DEP-').exists(),
        )

    def _check_expenses(self):
        prop = get_default_property()
        expenses = Expense.objects.filter(property=prop)
        self._check('six expenses', expenses.count() == 6, f'found {expenses.count()}')
        self._check(
            'expense total 25650.00',
            expenses.aggregate(total=Sum('amount'))['total'] == D('25650.00'),
        )
        self._check(
            'all expense categories exercised',
            {expense.category for expense in expenses} == {'maintenance', 'utilities', 'cleaning'},
        )

    def _check_idempotency(self):
        prop = get_default_property()
        before = sorted(
            (charge.tenancy_id, charge.month, charge.amount, charge.paid_amount)
            for charge in RentCharge.objects.filter(room__property=prop)
        )
        created_total = 0
        for month in MONTHS:
            created, _skipped, _total = generate_monthly_charges(month=month, property_obj=prop)
            created_total += created
        after = sorted(
            (charge.tenancy_id, charge.month, charge.amount, charge.paid_amount)
            for charge in RentCharge.objects.filter(room__property=prop)
        )
        self._check('regeneration is idempotent', created_total == 0, f'created {created_total}')
        self._check('historical charges unchanged', before == after)

    def _check_reports(self):
        prop = get_default_property()
        november = get_monthly_financial_report('2026-11', prop)['summary']
        self._check(
            'November report reconciles',
            november['rentCharged'] == 63500.0
            and november['rentReceived'] == 24500.0
            and november['totalExpenses'] == 5000.0
            and november['netCashIncome'] == 19500.0
            and november['outstandingRent'] == 40000.0,
            f'charged {november["rentCharged"]}, received {november["rentReceived"]}, '
            f'expenses {november["totalExpenses"]}, net {november["netCashIncome"]}, '
            f'outstanding {november["outstandingRent"]}',
        )
        july = get_monthly_financial_report('2026-07', prop)['summary']
        self._check(
            'July report reconciles',
            july['rentCharged'] == 13500.0
            and july['rentReceived'] == 13500.0
            and july['totalExpenses'] == 10500.0
            and july['netCashIncome'] == 3000.0,
            f'charged {july["rentCharged"]}, received {july["rentReceived"]}, '
            f'expenses {july["totalExpenses"]}, net {july["netCashIncome"]}',
        )
        october = get_monthly_financial_report('2026-10', prop)['summary']
        self._check(
            'October carries the 1000.00 partial balance',
            october['rentCharged'] == 49000.0
            and october['rentReceived'] == 48000.0
            and october['outstandingRent'] == 1000.0,
            f'charged {october["rentCharged"]}, received {october["rentReceived"]}, '
            f'outstanding {october["outstandingRent"]}',
        )
        dashboard = get_dashboard_metrics('2026-11', prop)
        self._check(
            'dashboard occupancy and outstanding',
            dashboard['occupancy']['totalRooms'] == 6
            and dashboard['occupancy']['occupiedCount'] == 5
            and dashboard['occupancy']['potentialRent'] == 73500.0
            and dashboard['totalOutstanding'] == 40000.0,
            f'rooms {dashboard["occupancy"]["occupiedCount"]}/'
            f'{dashboard["occupancy"]["totalRooms"]}, '
            f'potential {dashboard["occupancy"]["potentialRent"]}, '
            f'outstanding {dashboard["totalOutstanding"]}',
        )
