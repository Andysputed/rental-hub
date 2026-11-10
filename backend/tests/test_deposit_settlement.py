from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.properties.models import Property, Room
from apps.tenants.models import Tenant, Tenancy
from apps.payments.models import Deposit, DepositDeduction
from apps.rent.models import RentCharge


class DepositSettlementTests(TestCase):
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
            full_name="Alice Wambui",
            phone="+254712345678",
            email="alice@example.com",
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
            reference="DEP-01-INITIAL",
            notes="Initial deposit"
        )
        # Rent charge with arrears: 10,000 charge, 6,000 paid -> 4,000 balance
        self.charge = RentCharge.objects.create(
            tenancy=self.tenancy,
            room=self.room,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00"),
            paid_amount=Decimal("6000.00"),
            status="partial"
        )

    def test_settlement_summary_endpoint(self):
        """GET /api/v1/tenancies/{id}/settlement-summary/ returns accurate deposit and arrears."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settlement-summary/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['tenantName'], "Alice Wambui")
        self.assertEqual(res.data['deposit']['amount'], 10000.0)
        self.assertEqual(res.data['deposit']['status'], "held")
        self.assertEqual(res.data['eligibleArrears']['total'], 4000.0)
        self.assertEqual(len(res.data['eligibleArrears']['charges']), 1)

    def test_full_deposit_refund_with_zero_deductions(self):
        """1. Full deposit refund: 0 deductions, entire 10,000 KES refunded to tenant."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "0.00",
            "repairDeductions": [],
            "refundAmount": "10000.00",
            "refundMethod": "mpesa",
            "refundReference": "RFND-MPESA-001",
            "notes": "Full refund paid via M-Pesa. Keys received."
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.deposit.refresh_from_db()
        self.tenancy.refresh_from_db()
        self.room.refresh_from_db()

        self.assertEqual(self.deposit.status, "refunded")
        self.assertEqual(self.deposit.refund_amount, Decimal("10000.00"))
        self.assertEqual(self.deposit.refund_method, "mpesa")
        self.assertEqual(self.deposit.refund_reference, "RFND-MPESA-001")
        self.assertEqual(self.deposit.rent_deducted, Decimal("0.00"))
        self.assertEqual(self.deposit.repairs_deducted, Decimal("0.00"))
        self.assertIsNotNone(self.deposit.settled_at)

        # Tenancy ended and room vacant
        self.assertEqual(self.tenancy.status, "ended")
        self.assertEqual(self.room.status, "vacant")

    def test_partial_refund_with_rent_deduction(self):
        """2. Partial refund: rent arrears deducted from deposit, remaining refunded."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "4000.00",
            "repairDeductions": [],
            "refundAmount": "6000.00",
            "refundMethod": "mpesa",
            "refundReference": "RFND-MPESA-002",
            "notes": "4,000 rent arrears cleared from deposit, 6,000 refunded."
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.deposit.refresh_from_db()
        self.charge.refresh_from_db()

        self.assertEqual(self.deposit.status, "settled")
        self.assertEqual(self.deposit.rent_deducted, Decimal("4000.00"))
        self.assertEqual(self.deposit.refund_amount, Decimal("6000.00"))

        # Charge was updated and is now fully paid
        self.assertEqual(self.charge.paid_amount, Decimal("10000.00"))
        self.assertEqual(self.charge.status, "paid")
        self.assertEqual(self.charge.balance, Decimal("0.00"))

        # Deposit deduction audit record created
        rent_ded = DepositDeduction.objects.get(deposit=self.deposit, deduction_type='rent')
        self.assertEqual(rent_ded.amount, Decimal("4000.00"))
        self.assertEqual(rent_ded.charge, self.charge)

    def test_multiple_repair_deductions_and_refund(self):
        """3. Itemized damage/repair/cleaning deductions recorded accurately."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "0.00",
            "repairDeductions": [
                {"description": "Repainting damaged bedroom wall", "amount": "2500.00", "category": "repair"},
                {"description": "Deep cleaning and carpet wash", "amount": "1500.00", "category": "cleaning"}
            ],
            "refundAmount": "6000.00",
            "refundMethod": "bank",
            "refundReference": "TX-BK-8899",
            "notes": "Deductions for painting and deep cleaning."
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.deposit.refresh_from_db()
        self.assertEqual(self.deposit.status, "settled")
        self.assertEqual(self.deposit.repairs_deducted, Decimal("4000.00"))
        self.assertEqual(self.deposit.refund_amount, Decimal("6000.00"))

        # Verify deductions
        deductions = list(self.deposit.deductions.all())
        self.assertEqual(len(deductions), 2)
        self.assertEqual(deductions[0].deduction_type, "repair")
        self.assertEqual(deductions[0].amount, Decimal("2500.00"))
        self.assertEqual(deductions[1].deduction_type, "cleaning")
        self.assertEqual(deductions[1].amount, Decimal("1500.00"))

    def test_settlement_where_no_refund_remains(self):
        """4. Zero refund remaining: rent + repairs consume entire 10,000 KES deposit."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "4000.00",
            "repairDeductions": [
                {"description": "Broken door lock replacement", "amount": "6000.00", "category": "repair"}
            ],
            "refundAmount": "0.00",
            "notes": "Deposit fully consumed by arrears and repairs."
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.deposit.refresh_from_db()
        self.assertEqual(self.deposit.status, "settled")
        self.assertEqual(self.deposit.rent_deducted, Decimal("4000.00"))
        self.assertEqual(self.deposit.repairs_deducted, Decimal("6000.00"))
        self.assertEqual(self.deposit.refund_amount, Decimal("0.00"))
        self.assertEqual(self.deposit.refundable_balance, Decimal("0.00"))

    def test_attempted_deductions_exceeding_deposit_rejected(self):
        """5. Total deductions > deposit held is rejected with 400 Bad Request."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "4000.00",
            "repairDeductions": [
                {"description": "Major structural repair", "amount": "7000.00", "category": "repair"}
            ],
            "refundAmount": "0.00"
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("totalDeductions", res.data)

    def test_rent_deduction_exceeding_eligible_arrears_rejected(self):
        """6. Rent deduction > eligible arrears (4,000) is rejected."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "5000.00",  # Only 4,000 is outstanding
            "repairDeductions": [],
            "refundAmount": "5000.00"
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rentDeduction", res.data)

    def test_duplicate_settlement_rejected(self):
        """7. Settling an already settled deposit is rejected."""
        url = f"/api/v1/tenancies/{self.tenancy.id}/settle-deposit/"
        payload = {
            "endDate": "2026-10-31",
            "rentDeduction": "0.00",
            "repairDeductions": [],
            "refundAmount": "10000.00"
        }
        # First settlement
        res1 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second settlement attempt
        res2 = self.client.post(url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("deposit", res2.data)

    def test_settle_via_deposit_endpoint(self):
        """8. Direct POST /api/v1/deposits/{id}/settle/ executes settlement properly."""
        url = f"/api/v1/deposits/{self.deposit.id}/settle/"
        payload = {
            "rentDeduction": "4000.00",
            "repairDeductions": [],
            "refundAmount": "6000.00",
            "refundMethod": "cash",
            "notes": "Settled directly via deposit viewset."
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.deposit.refresh_from_db()
        self.assertEqual(self.deposit.status, "settled")
        self.assertEqual(self.deposit.refund_amount, Decimal("6000.00"))

