from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from apps.payments.models import Payment, PaymentAllocation
from apps.expenses.models import Expense


class FinancialLedgerTestCase(TestCase):
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

        # 5 occupied rooms, 1 vacant room (Room 06)
        self.rooms = []
        self.tenants = []
        self.tenancies = []

        for i in range(1, 7):
            num = f"{i:02d}"
            is_occupied = i < 6
            room = Room.objects.create(
                property=self.property,
                number=num,
                name=f"Room {num}",
                default_rent=Decimal("10000.00"),
                status="occupied" if is_occupied else "vacant"
            )
            self.rooms.append(room)

            if is_occupied:
                tenant = Tenant.objects.create(
                    full_name=f"Tenant {num}",
                    phone=f"+254 700 000 00{i}"
                )
                self.tenants.append(tenant)
                tenancy = Tenancy.objects.create(
                    tenant=tenant,
                    room=room,
                    start_date=date(2026, 10, 1),
                    monthly_rent=Decimal("10000.00"),
                    deposit=Decimal("10000.00"),
                    rent_due_day=5,
                    status="active"
                )
                self.tenancies.append(tenancy)

    def test_monthly_charge_generation_skips_vacant_rooms(self):
        """Charge generation only creates charges for active tenancies (5 rooms), skipping vacant Room 06."""
        response = self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['createdCount'], 5)
        self.assertEqual(response.data['totalAmount'], 50000.00)

        # Room 06 must have NO charge
        room06_charges = RentCharge.objects.filter(room__number='06', month='2026-10')
        self.assertEqual(room06_charges.count(), 0)

    def test_monthly_charge_generation_duplicate_prevention(self):
        """Calling generate multiple times for the same month creates no duplicates."""
        # First call
        res1 = self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        self.assertEqual(res1.data['createdCount'], 5)

        # Second call
        res2 = self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        self.assertEqual(res2.data['createdCount'], 0)
        self.assertEqual(res2.data['skippedCount'], 5)
        self.assertEqual(RentCharge.objects.filter(month='2026-10').count(), 5)

    def test_record_partial_payment_and_allocation(self):
        """Partial payment updates paid_amount, balance, and creates explicit allocation."""
        # Generate charges
        self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        r3 = self.rooms[2]
        charge = RentCharge.objects.get(room=r3, month='2026-10')

        # Pay KSh 7,500 on 10,000 rent
        payment_payload = {
            'roomId': r3.id,
            'amount': '7500.00',
            'method': 'mpesa',
            'reference': 'UJ4R8K2M6P',
            'paymentDate': '2026-10-04',
            'chargeId': charge.id
        }
        res = self.client.post('/api/v1/payments/', payment_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['receiptNumber'], 'RH-2026-001')
        self.assertEqual(float(res.data['amount']), 7500.00)

        # Check charge balance
        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('7500.00'))
        self.assertEqual(charge.balance, Decimal('2500.00'))

        # Check allocation record exists
        allocation = PaymentAllocation.objects.filter(payment_id=res.data['id']).first()
        self.assertIsNotNone(allocation)
        self.assertEqual(allocation.amount, Decimal('7500.00'))

    def test_record_full_payment_clears_charge(self):
        """Full payment clears charge with status 'paid' and zero balance."""
        self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        r1 = self.rooms[0]
        charge = RentCharge.objects.get(room=r1, month='2026-10')

        res = self.client.post('/api/v1/payments/', {
            'roomId': r1.id,
            'amount': '10000.00',
            'method': 'mpesa',
            'reference': 'UJ2A6H9N3K',
            'paymentDate': '2026-10-02',
            'chargeId': charge.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('10000.00'))
        self.assertEqual(charge.balance, Decimal('0.00'))
        self.assertEqual(charge.status, 'paid')

    def test_reject_duplicate_payment_reference(self):
        """Cannot record two payments with the same transaction reference code."""
        self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        r1 = self.rooms[0]

        payload = {
            'roomId': r1.id,
            'amount': '5000.00',
            'method': 'mpesa',
            'reference': 'DUPLICATE_CODE_123',
            'paymentDate': '2026-10-05'
        }
        res1 = self.client.post('/api/v1/payments/', payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Attempt to record again with same reference
        res2 = self.client.post('/api/v1/payments/', payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('reference', res2.data)

    def test_receipt_endpoint_details(self):
        """Receipt endpoint returns all receipt metadata and balance reconciliation."""
        self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-10'}, format='json')
        r1 = self.rooms[0]
        pay_res = self.client.post('/api/v1/payments/', {
            'roomId': r1.id,
            'amount': '10000.00',
            'method': 'mpesa',
            'reference': 'REF_REC_001',
            'paymentDate': '2026-10-02'
        }, format='json')
        payment_id = pay_res.data['id']

        receipt_res = self.client.get(f'/api/v1/payments/{payment_id}/receipt/')
        self.assertEqual(receipt_res.status_code, status.HTTP_200_OK)
        data = receipt_res.data
        self.assertEqual(data['receiptNumber'], pay_res.data['receiptNumber'])
        self.assertEqual(data['tenant']['fullName'], 'Tenant 01')
        self.assertEqual(data['room']['name'], 'Room 01')
        self.assertEqual(data['property']['name'], 'Acacia House')
        self.assertEqual(data['allocation']['balanceAfter'], 0.0)

    def test_expense_crud_and_filters(self):
        """Expenses can be recorded and filtered by category and month."""
        res = self.client.post('/api/v1/expenses/', {
            'category': 'cleaning',
            'title': 'Compound Cleaning',
            'amount': '1500.00',
            'date': '2026-10-15',
            'method': 'cash'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res2 = self.client.post('/api/v1/expenses/', {
            'category': 'maintenance',
            'title': 'Water tap repair',
            'amount': '4500.00',
            'date': '2026-10-10',
            'method': 'mpesa'
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

        # Filter by category
        cat_res = self.client.get('/api/v1/expenses/?category=cleaning')
        self.assertEqual(cat_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(cat_res.data), 1)
        self.assertEqual(cat_res.data[0]['title'], 'Compound Cleaning')

        # Filter by month
        month_res = self.client.get('/api/v1/expenses/?month=2026-10')
        self.assertEqual(month_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(month_res.data), 2)
