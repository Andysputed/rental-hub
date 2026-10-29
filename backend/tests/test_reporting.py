from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from apps.payments.models import Payment, PaymentAllocation, Deposit
from apps.expenses.models import Expense


class ReportingAndReconciliationTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='testlandlord', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.property = Property.objects.create(
            id=1,
            name="Acacia House",
            location="Nairobi · 6 rooms",
            currency="KES"
        )
        self.settings = PropertySettings.objects.create(
            property=self.property,
            landlord_name="Veronicah K.",
            landlord_initials="VK",
            default_due_day=5,
            auto_generate_charges=True
        )

        # 5 occupied rooms, 1 vacant room
        self.rooms = []
        self.tenants = []
        self.tenancies = []

        for i in range(1, 7):
            num = f"{i:02d}"
            is_occ = i < 6
            r = Room.objects.create(
                property=self.property,
                number=num,
                name=f"Room {num}",
                default_rent=Decimal("10000.00"),
                status="occupied" if is_occ else "vacant"
            )
            self.rooms.append(r)

            if is_occ:
                t = Tenant.objects.create(
                    full_name=f"Tenant {num}",
                    phone=f"+254 700 000 00{i}"
                )
                self.tenants.append(t)
                tenancy = Tenancy.objects.create(
                    tenant=t,
                    room=r,
                    start_date=date(2026, 10, 1),
                    monthly_rent=Decimal("10000.00"),
                    deposit=Decimal("10000.00"),
                    rent_due_day=5,
                    status="active"
                )
                self.tenancies.append(tenancy)

                # Record security deposit (must NOT count as rent income)
                Deposit.objects.create(
                    tenancy=tenancy,
                    tenant=t,
                    amount=Decimal("10000.00"),
                    received_date=date(2026, 10, 1),
                    status="held",
                    reference=f"DEP-{num}"
                )

        # Generate October 2026 charges: 5 charges @ 10,000 = 50,000 KES charged
        self.charges = []
        for tenancy in self.tenancies:
            c = RentCharge.objects.create(
                tenancy=tenancy,
                room=tenancy.room,
                month="2026-10",
                due_date=date(2026, 10, 5),
                amount=Decimal("10000.00"),
                paid_amount=Decimal("0.00"),
                status="unpaid"
            )
            self.charges.append(c)

        # Record Payments matching wireframe totals:
        # Room 01: 10,000 (paid in full)
        # Room 02: 10,000 (paid in full)
        # Room 03: 7,500 (2,500 balance)
        # Room 04: 6,000 (4,000 balance)
        # Room 05: 5,000 (5,000 balance)
        # Total received = 38,500 KES. Total outstanding = 11,500 KES.
        payments_data = [
            (0, Decimal("10000.00"), "RH-2026-001", "REF-001", date(2026, 10, 2)),
            (1, Decimal("10000.00"), "RH-2026-002", "REF-002", date(2026, 10, 3)),
            (2, Decimal("7500.00"),  "RH-2026-003", "REF-003", date(2026, 10, 4)),
            (3, Decimal("6000.00"),  "RH-2026-004", "REF-004", date(2026, 10, 8)),
            (4, Decimal("5000.00"),  "RH-2026-005", "REF-005", date(2026, 10, 12)),
        ]
        for idx, amt, rec_no, ref, p_date in payments_data:
            c = self.charges[idx]
            ten = self.tenancies[idx]
            p = Payment.objects.create(
                tenant=ten.tenant,
                tenancy=ten,
                room=ten.room,
                charge=c,
                receipt_number=rec_no,
                amount=amt,
                date=p_date,
                method="mpesa",
                reference=ref
            )
            PaymentAllocation.objects.create(payment=p, charge=c, amount=amt)
            c.paid_amount += amt
            c.update_status()
            c.save()

        # Record Expenses:
        # Cleaning: 1,500
        # Tap repair: 4,500
        # Security light: 2,500
        # Total expenses = 8,500 KES.
        Expense.objects.create(property=self.property, category="cleaning", title="Compound cleaning", amount=Decimal("1500.00"), date=date(2026, 10, 15), method="cash")
        Expense.objects.create(property=self.property, category="maintenance", title="Tap repair", amount=Decimal("4500.00"), date=date(2026, 10, 10), method="mpesa")
        Expense.objects.create(property=self.property, category="utilities", title="Security light", amount=Decimal("2500.00"), date=date(2026, 10, 8), method="cash")

    def test_dashboard_metrics_mathematical_reconciliation(self):
        """Dashboard metrics strictly reconcile with the underlying ledger records."""
        res = self.client.get('/api/v1/dashboard/metrics/?month=2026-10')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        d = res.data

        # 1. Total rent charged: 50,000 KES
        self.assertEqual(d['totalRentCharged'], 50000.00)

        # 2. Total rent received: 38,500 KES
        self.assertEqual(d['totalRentReceived'], 38500.00)

        # 3. Total outstanding: 11,500 KES
        self.assertEqual(d['totalOutstanding'], 11500.00)

        # 4. Reconciliation check: charged == received + outstanding
        self.assertAlmostEqual(d['totalRentCharged'], d['totalRentReceived'] + d['totalOutstanding'], places=2)

        # 5. Collection rate: round(38500 / 50000 * 100) = 77%
        self.assertEqual(d['collectionRate'], 77)

        # 6. Expenses: 8,500 KES
        self.assertEqual(d['totalExpenses'], 8500.00)

        # 7. Net cash income: 38,500 - 8,500 = 30,000 KES
        self.assertEqual(d['netCashIncome'], 30000.00)
        self.assertAlmostEqual(d['netCashIncome'], d['totalRentReceived'] - d['totalExpenses'], places=2)

        # 8. Occupancy: 5 of 6 (83%)
        occ = d['occupancy']
        self.assertEqual(occ['totalRooms'], 6)
        self.assertEqual(occ['occupiedCount'], 5)
        self.assertEqual(occ['vacantCount'], 1)
        self.assertEqual(occ['occupancyPercentage'], 83)
        self.assertEqual(occ['potentialRent'], 60000.00)

        # 9. Overdue count: 3 overdue rooms (Rooms 03, 04, 05)
        self.assertEqual(d['overdueCount'], 3)
        self.assertEqual(len(d['needsAttention']), 3)

        # 10. Recent payments count: 5
        self.assertEqual(len(d['recentPayments']), 5)

    def test_monthly_report_cash_basis_integrity(self):
        """Monthly financial report distinguishes cash collections from security deposits."""
        res = self.client.get('/api/v1/reports/monthly/?month=2026-10')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        report = res.data

        summary = report['summary']
        self.assertEqual(summary['rentCharged'], 50000.00)
        self.assertEqual(summary['rentReceived'], 38500.00)
        self.assertEqual(summary['outstandingRent'], 11500.00)
        self.assertEqual(summary['totalExpenses'], 8500.00)
        self.assertEqual(summary['netCashIncome'], 30000.00)
        self.assertEqual(summary['potentialFullOccupancy'], 60000.00)

        # Cash movement bar data
        cm = report['cashMovement']
        self.assertEqual(cm['rentReceived'], 38500.00)
        self.assertEqual(cm['expenses'], 8500.00)
        self.assertEqual(cm['netCashIncome'], 30000.00)

        # Expense breakdown
        exp = report['expenseBreakdown']
        self.assertEqual(exp['total'], 8500.00)
        self.assertEqual(exp['byCategory']['cleaning'], 1500.00)
        self.assertEqual(exp['byCategory']['maintenance'], 4500.00)
        self.assertEqual(exp['byCategory']['utilities'], 2500.00)
        self.assertEqual(len(exp['items']), 3)

        # Outstanding balances list
        ob = report['outstandingBalances']
        self.assertEqual(ob['total'], 11500.00)
        self.assertEqual(ob['count'], 3)
        self.assertEqual(len(ob['items']), 3)

    def test_invalid_month_format_returns_bad_request(self):
        """Invalid month queries return 400 Bad Request."""
        res = self.client.get('/api/v1/dashboard/metrics/?month=invalid-date')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)
