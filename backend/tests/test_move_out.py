from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.properties.models import Property, Room
from apps.tenants.models import Tenant, Tenancy
from apps.payments.models import Deposit
from apps.rent.models import RentCharge
from apps.rent.services import generate_monthly_charges


class MoveOutApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(username='testlandlord', email='test@example.com', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.prop = Property.objects.create(name="Acacia House", currency="KES")
        self.room = Room.objects.create(
            property=self.prop,
            number="01",
            name="Room 01",
            default_rent=Decimal("10000.00"),
            status="occupied"
        )
        self.tenant = Tenant.objects.create(
            full_name="John Doe",
            phone="+254712345678",
            email="john@example.com",
            status="active"
        )
        self.tenancy = Tenancy.objects.create(
            tenant=self.tenant,
            room=self.room,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            deposit=Decimal("10000.00"),
            rent_due_day=5,
            status="active"
        )
        self.deposit = Deposit.objects.create(
            tenancy=self.tenancy,
            tenant=self.tenant,
            amount=Decimal("10000.00"),
            received_date=date(2026, 10, 1),
            status="held",
            reference="DEP-01",
            notes="Initial security deposit"
        )
        self.charge = RentCharge.objects.create(
            tenancy=self.tenancy,
            room=self.room,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00"),
            paid_amount=Decimal("10000.00"),
            status="paid"
        )

    def test_successful_move_out(self):
        """1 & 2: Landlord can successfully move out a tenant; tenancy is ended and room becomes vacant."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        data = {
            "endDate": "2026-10-31",
            "notes": "Relocating for work; keys returned."
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.tenancy.refresh_from_db()
        self.room.refresh_from_db()
        self.tenant.refresh_from_db()
        self.deposit.refresh_from_db()

        # Tenancy marked ended with correct end date
        self.assertEqual(self.tenancy.status, "ended")
        self.assertEqual(self.tenancy.end_date, date(2026, 10, 31))

        # Room marked vacant
        self.assertEqual(self.room.status, "vacant")

        # Tenant marked former
        self.assertEqual(self.tenant.status, "former")

        # Deposit notes preserved
        self.assertIn("Relocating for work", self.deposit.notes)

    def test_historical_financial_records_preserved(self):
        """3: Historical charges and deposit records remain intact after move-out."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        response = self.client.post(url, {"endDate": "2026-10-31"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Existing rent charge and deposit still exist and point to the historical tenancy
        self.assertTrue(RentCharge.objects.filter(id=self.charge.id).exists())
        self.assertTrue(Deposit.objects.filter(id=self.deposit.id).exists())

    def test_future_rent_generation_skips_ended_tenancy(self):
        """5: Future rent generation does not create charges for the ended tenancy."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        self.client.post(url, {"endDate": "2026-10-31"}, format="json")

        # Generate charges for next month (November)
        created_count, skipped_count, total = generate_monthly_charges(month="2026-11", property_obj=self.prop)
        self.assertEqual(created_count, 0)
        self.assertFalse(RentCharge.objects.filter(tenancy=self.tenancy, month="2026-11").exists())

    def test_duplicate_move_out_rejected(self):
        """6: Duplicate move-out requests are rejected safely."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        # First move-out
        res1 = self.client.post(url, {"endDate": "2026-10-31"}, format="json")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second move-out
        res2 = self.client.post(url, {"endDate": "2026-10-31"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already ended", res2.data["error"])

    def test_invalid_move_out_date_rejected(self):
        """7: Invalid move-out date (before move-in date) is rejected."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        data = {"endDate": "2026-09-15"}  # Before start date 2026-10-01
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("endDate", response.data)

    def test_invalid_tenancy_id_returns_404(self):
        """7b: Non-existent tenancy ID returns 404."""
        url = "/api/v1/tenancies/99999/move-out/"
        response = self.client.post(url, {"endDate": "2026-10-31"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_new_tenancy_can_be_assigned_after_move_out(self):
        """9: The vacated room can be safely assigned to a new tenant without constraint violations."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        self.client.post(url, {"endDate": "2026-10-31"}, format="json")

        new_tenant_url = "/api/v1/tenancies/register/"
        new_data = {
            "fullName": "Jane Smith",
            "phone": "+254799887766",
            "roomId": self.room.id,
            "moveInDate": "2026-11-01",
            "monthlyRent": 10000.0,
            "deposit": 10000.0,
            "rentDueDay": 5
        }
        res = self.client.post(new_tenant_url, new_data, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.room.refresh_from_db()
        self.assertEqual(self.room.status, "occupied")

    def test_past_move_out_date_does_not_alter_historical_charges_or_reports(self):
        """Confirm that a move-out date in the past cannot cause incorrect rent charges or alter historical reports."""
        from apps.reports.services import get_monthly_financial_report

        # Initial October report before move-out
        report_before = get_monthly_financial_report("2026-10", property_obj=self.prop)
        charged_before = report_before["summary"]["rentCharged"]
        received_before = report_before["summary"]["rentReceived"]
        outstanding_before = report_before["summary"]["outstandingRent"]

        # Move out with a past date (e.g. 2026-10-15)
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        res = self.client.post(url, {"endDate": "2026-10-15", "notes": "Left mid-month"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Existing October charge amount and paid status remain strictly unchanged
        self.charge.refresh_from_db()
        self.assertEqual(self.charge.amount, Decimal("10000.00"))
        self.assertEqual(self.charge.paid_amount, Decimal("10000.00"))
        self.assertEqual(self.charge.status, "paid")

        # Historical October report remains strictly identical
        report_after = get_monthly_financial_report("2026-10", property_obj=self.prop)
        self.assertEqual(report_after["summary"]["rentCharged"], charged_before)
        self.assertEqual(report_after["summary"]["rentReceived"], received_before)
        self.assertEqual(report_after["summary"]["outstandingRent"], outstanding_before)

        # Future month (November) charge generation strictly skips the ended tenancy
        created_count, skipped_count, _ = generate_monthly_charges(month="2026-11", property_obj=self.prop)
        self.assertEqual(created_count, 0)

    def test_reassigned_tenant_does_not_inherit_previous_charges_or_details(self):
        """Confirm that a new tenant can be assigned to the vacated room without inheriting the previous tenant's charges or tenancy details."""
        # 1. Leave previous tenant with an unpaid balance on their October charge
        self.charge.paid_amount = Decimal("6000.00")
        self.charge.status = "partial"
        self.charge.save()

        # 2. Previous tenant moves out
        url = f"/api/v1/tenancies/{self.tenancy.id}/move-out/"
        self.client.post(url, {"endDate": "2026-10-20"}, format="json")

        # 3. Register a brand new tenant in Room 01
        reg_url = "/api/v1/tenancies/register/"
        new_data = {
            "fullName": "Alice Kamau",
            "phone": "+254711223344",
            "roomId": self.room.id,
            "moveInDate": "2026-11-01",
            "monthlyRent": 12000.0,
            "deposit": 12000.0,
            "rentDueDay": 5
        }
        reg_res = self.client.post(reg_url, new_data, format="json")
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        new_tenancy_id = reg_res.data["id"]

        # 4. Generate charges for November
        generate_monthly_charges(month="2026-11", property_obj=self.prop)

        # 5. Verify charge isolation:
        # - Previous tenant's charge is still linked strictly to old tenancy
        old_charges = RentCharge.objects.filter(tenancy=self.tenancy)
        self.assertEqual(old_charges.count(), 1)
        self.assertEqual(old_charges.first().month, "2026-10")
        self.assertEqual(old_charges.first().balance, Decimal("4000.00"))

        # - New tenant's charges are linked strictly to new tenancy
        new_charges = RentCharge.objects.filter(tenancy_id=new_tenancy_id)
        self.assertEqual(new_charges.count(), 1)
        self.assertEqual(new_charges.first().month, "2026-11")
        self.assertEqual(new_charges.first().amount, Decimal("12000.00"))
        self.assertEqual(new_charges.first().paid_amount, Decimal("0.00"))
        self.assertEqual(new_charges.first().balance, Decimal("12000.00"))

        # - API query for new tenancy does NOT return old tenant's charges
        api_res = self.client.get(f"/api/v1/rent-charges/?tenancyId={new_tenancy_id}")
        self.assertEqual(api_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(api_res.data['results']), 1)
        self.assertEqual(api_res.data['results'][0]["month"], "2026-11")
        self.assertEqual(float(api_res.data['results'][0]["amount"]), 12000.0)
