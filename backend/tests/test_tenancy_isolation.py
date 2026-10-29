from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status
from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from apps.payments.models import Payment, PaymentAllocation, Deposit
from apps.rent.services import generate_monthly_charges
from apps.reports.services import get_dashboard_metrics, get_monthly_financial_report


class TenancyHistoricalIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='testlandlord', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.property = Property.objects.create(
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
        self.room3 = Room.objects.create(
            property=self.property,
            number="03",
            name="Room 03",
            default_rent=Decimal("10000.00"),
            status="occupied"
        )
        self.room6 = Room.objects.create(
            property=self.property,
            number="06",
            name="Room 06",
            default_rent=Decimal("10000.00"),
            status="vacant"
        )

        # 1. Tenant A occupies Room 03 and receives rent charges and payments
        self.tenant_a = Tenant.objects.create(
            full_name="Faith Wanjiku",
            phone="+254 733 333 333",
            email="faith@example.com",
            status="active"
        )
        self.tenancy_a = Tenancy.objects.create(
            tenant=self.tenant_a,
            room=self.room3,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            deposit=Decimal("10000.00"),
            rent_due_day=5,
            status="active"
        )
        self.deposit_a = Deposit.objects.create(
            tenancy=self.tenancy_a,
            tenant=self.tenant_a,
            amount=Decimal("10000.00"),
            received_date=date(2026, 10, 1),
            status="held",
            reference="DEP-03",
            notes="Security deposit for Faith Wanjiku"
        )
        self.charge_a = RentCharge.objects.create(
            tenancy=self.tenancy_a,
            room=self.room3,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00"),
            paid_amount=Decimal("7500.00"),
            status="overdue"
        )
        self.payment_a = Payment.objects.create(
            tenant=self.tenant_a,
            tenancy=self.tenancy_a,
            room=self.room3,
            charge=self.charge_a,
            receipt_number="RH-2026-003",
            amount=Decimal("7500.00"),
            date=date(2026, 10, 4),
            method="mpesa",
            reference="UJ4R8K2M6P",
            notes="Partial payment"
        )
        PaymentAllocation.objects.create(
            payment=self.payment_a,
            charge=self.charge_a,
            amount=Decimal("7500.00")
        )

    def test_complete_tenant_lifecycle_and_historical_isolation(self):
        """
        Verify requirements 1 through 10:
        Tenant A moves out with arrears and deposit;
        Tenant B moves in with clean slate;
        No arrears or payments bleed across tenancies;
        Tenant A's historical records remain completely intact.
        """
        # Step 2: Tenant A moves out with an outstanding rent balance and an unsettled deposit
        move_out_url = f"/api/v1/tenancies/{self.tenancy_a.id}/move-out/"
        move_out_res = self.client.post(move_out_url, {
            "endDate": "2026-10-22",
            "notes": "Moving out. Deposit retained pending arrears settlement."
        }, format="json")
        self.assertEqual(move_out_res.status_code, status.HTTP_200_OK)

        # Step 3: Tenant A's tenancy and financial records remain intact
        self.tenancy_a.refresh_from_db()
        self.room3.refresh_from_db()
        self.tenant_a.refresh_from_db()
        self.charge_a.refresh_from_db()
        self.deposit_a.refresh_from_db()

        self.assertEqual(self.tenancy_a.status, "ended")
        self.assertEqual(self.tenancy_a.end_date, date(2026, 10, 22))
        self.assertEqual(self.room3.status, "vacant")
        self.assertEqual(self.tenant_a.status, "former")
        self.assertEqual(self.charge_a.balance, Decimal("2500.00"))
        self.assertEqual(self.deposit_a.status, "held")
        self.assertEqual(self.deposit_a.amount, Decimal("10000.00"))

        # Step 4: A new Tenant B is assigned to Room 03
        reg_url = "/api/v1/tenancies/register/"
        new_tenant_payload = {
            "fullName": "Brian Kipchumba",
            "phone": "+254 722 888 999",
            "email": "brian.k@example.com",
            "roomId": self.room3.id,
            "moveInDate": "2026-11-01",
            "monthlyRent": 10500.0,
            "deposit": 10500.0,
            "rentDueDay": 5
        }
        reg_res = self.client.post(reg_url, new_tenant_payload, format="json")
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        tenancy_b_id = reg_res.data["id"]

        tenancy_b = Tenancy.objects.get(id=tenancy_b_id)
        tenant_b = tenancy_b.tenant

        # Step 5: Tenant B's profile and tenancy are distinct from Tenant A's
        self.assertNotEqual(tenant_b.id, self.tenant_a.id)
        self.assertEqual(tenant_b.full_name, "Brian Kipchumba")
        self.assertEqual(tenant_b.status, "active")
        self.assertNotEqual(tenancy_b.id, self.tenancy_a.id)
        self.assertEqual(tenancy_b.status, "active")
        self.assertEqual(tenancy_b.monthly_rent, Decimal("10500.00"))

        # Room 03 is now occupied by Tenant B's tenancy
        self.room3.refresh_from_db()
        self.assertEqual(self.room3.status, "occupied")
        self.assertEqual(self.room3.get_current_tenancy().id, tenancy_b.id)

        # Step 6: Tenant B starts with no inherited arrears or payments
        b_charges = RentCharge.objects.filter(tenancy=tenancy_b)
        self.assertEqual(b_charges.count(), 0)  # Starts with clean slate

        b_payments = Payment.objects.filter(tenancy=tenancy_b)
        self.assertEqual(b_payments.count(), 0)

        # Step 7: New rent charges are attached to Tenant B's tenancy only
        created, skipped, _ = generate_monthly_charges(month="2026-11", property_obj=self.property)
        self.assertGreaterEqual(created, 1)

        b_nov_charge = RentCharge.objects.get(tenancy=tenancy_b, month="2026-11")
        self.assertEqual(b_nov_charge.amount, Decimal("10500.00"))
        self.assertEqual(b_nov_charge.paid_amount, Decimal("0.00"))
        self.assertEqual(b_nov_charge.balance, Decimal("10500.00"))

        # Tenant A never received a November charge
        self.assertFalse(RentCharge.objects.filter(tenancy=self.tenancy_a, month="2026-11").exists())

        # Step 8: Tenant B cannot see Tenant A's receipts or deposit details
        # Payments queried by tenancyId
        payments_res_b = self.client.get(f"/api/v1/payments/?tenancyId={tenancy_b.id}")
        self.assertEqual(payments_res_b.status_code, status.HTTP_200_OK)
        self.assertEqual(len(payments_res_b.data), 0)

        deposits_res_b = self.client.get(f"/api/v1/deposits/?tenancyId={tenancy_b.id}")
        self.assertEqual(deposits_res_b.status_code, status.HTTP_200_OK)
        self.assertEqual(len(deposits_res_b.data), 1)
        self.assertEqual(Decimal(str(deposits_res_b.data[0]["amount"])), Decimal("10500.00"))
        self.assertEqual(deposits_res_b.data[0]["tenantName"], "Brian Kipchumba")

        # Step 9: Tenant A's historical balances and records remain accessible
        a_charges_res = self.client.get(f"/api/v1/rent-charges/?tenancyId={self.tenancy_a.id}")
        self.assertEqual(a_charges_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(a_charges_res.data), 1)
        self.assertEqual(a_charges_res.data[0]["month"], "2026-10")
        self.assertEqual(float(a_charges_res.data[0]["balance"]), 2500.0)

        a_payments_res = self.client.get(f"/api/v1/payments/?tenancyId={self.tenancy_a.id}")
        self.assertEqual(a_payments_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(a_payments_res.data), 1)
        self.assertEqual(a_payments_res.data[0]["receiptNumber"], "RH-2026-003")

        # Step 10: Dashboard metrics distinguish current occupancy from historical debt
        metrics = get_dashboard_metrics(month="2026-10", property_obj=self.property)
        self.assertIn("formerTenantsOutstanding", metrics)
        self.assertIn("currentTenantsOutstanding", metrics)
        # In October, Tenant A was ended, so their 2500 is counted in formerTenantsOutstanding
        self.assertEqual(metrics["formerTenantsOutstanding"], 2500.0)
        self.assertEqual(metrics["totalOutstanding"], 2500.0)

    def test_returning_tenant_creates_clean_tenancy_without_duplicating_profile(self):
        """
        Requirement 11: A returning tenant can have a new tenancy without overwriting the previous tenancy.
        """
        # Tenant A moves out of Room 03
        self.client.post(f"/api/v1/tenancies/{self.tenancy_a.id}/move-out/", {
            "endDate": "2026-10-22"
        }, format="json")
        self.tenancy_a.refresh_from_db()
        self.assertEqual(self.tenancy_a.status, "ended")

        # Tenant A returns later and moves into Room 06 using the same phone number
        reg_res = self.client.post("/api/v1/tenancies/register/", {
            "fullName": "Faith Wanjiku (Returning)",
            "phone": self.tenant_a.phone,
            "email": "faith.wanjiku@newdomain.com",
            "roomId": self.room6.id,
            "moveInDate": "2026-11-01",
            "monthlyRent": 9500.0,
            "deposit": 9500.0,
            "rentDueDay": 5
        }, format="json")
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        new_tenancy_id = reg_res.data["id"]

        # Only one Tenant record exists for this phone number
        self.assertEqual(Tenant.objects.filter(phone=self.tenant_a.phone).count(), 1)
        self.tenant_a.refresh_from_db()
        self.assertEqual(self.tenant_a.status, "active")

        # But there are two distinct Tenancies for Tenant A
        tenancies = self.tenant_a.tenancies.all().order_by("start_date")
        self.assertEqual(tenancies.count(), 2)

        old_tenancy, new_tenancy = tenancies[0], tenancies[1]
        self.assertEqual(old_tenancy.id, self.tenancy_a.id)
        self.assertEqual(old_tenancy.status, "ended")
        self.assertEqual(old_tenancy.room.number, "03")

        self.assertEqual(new_tenancy.id, new_tenancy_id)
        self.assertEqual(new_tenancy.status, "active")
        self.assertEqual(new_tenancy.room.number, "06")
        self.assertEqual(new_tenancy.monthly_rent, Decimal("9500.00"))

        # The new tenancy has clean ledgers
        self.assertEqual(new_tenancy.charges.count(), 0)
        self.assertEqual(new_tenancy.payments.count(), 0)
        # Old tenancy's debt remains on old tenancy
        self.assertEqual(old_tenancy.charges.first().balance, Decimal("2500.00"))

    def test_room_cannot_have_two_simultaneous_active_tenancies(self):
        """
        Requirement 12: A room cannot be assigned to two simultaneous active tenancies.
        """
        # Room 03 is occupied by Tenant A with active tenancy
        reg_res = self.client.post("/api/v1/tenancies/register/", {
            "fullName": "Conflicting Tenant",
            "phone": "+254 788 777 666",
            "roomId": self.room3.id,
            "moveInDate": "2026-10-25",
            "monthlyRent": 10000.0
        }, format="json")
        self.assertEqual(reg_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("roomId", reg_res.data)

        # Direct database attempt raises IntegrityError due to unique constraint
        new_tenant = Tenant.objects.create(full_name="Direct DB", phone="+254 799 000 111")
        with self.assertRaises(IntegrityError):
            Tenancy.objects.create(
                tenant=new_tenant,
                room=self.room3,
                start_date=date(2026, 10, 25),
                monthly_rent=Decimal("10000.00"),
                status="active"
            )

    def test_existing_seeded_records_and_reports_remain_valid(self):
        """
        Requirement 13: Existing records and historical reports remain valid.
        """
        report = get_monthly_financial_report(month="2026-10", property_obj=self.property)
        self.assertEqual(report["summary"]["rentCharged"], 10000.0)
        self.assertEqual(report["summary"]["rentReceived"], 7500.0)
        self.assertEqual(report["summary"]["outstandingRent"], 2500.0)
        self.assertEqual(report["summary"]["currentTenantsOutstanding"], 2500.0)
        self.assertEqual(report["summary"]["formerTenantsOutstanding"], 0.0)
