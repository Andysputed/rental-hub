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


class EdgeCaseTestSuite(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(username='testlandlord', email='test@example.com', password='testpass123')
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

        self.room1 = Room.objects.create(
            property=self.property,
            number="01",
            name="Room 01",
            default_rent=Decimal("10000.00"),
            status="occupied"
        )
        self.room2 = Room.objects.create(
            property=self.property,
            number="02",
            name="Room 02",
            default_rent=Decimal("10000.00"),
            status="vacant"
        )

        self.tenant = Tenant.objects.create(
            full_name="Alice Test",
            phone="+254 700 111 222",
            email="alice@test.com",
            status="active"
        )
        self.tenancy = Tenancy.objects.create(
            tenant=self.tenant,
            room=self.room1,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            deposit=Decimal("10000.00"),
            rent_due_day=5,
            status="active"
        )

    def test_payment_exceeding_total_balance_is_retained_as_credit(self):
        """Money beyond the rent balance is recorded as available advance credit."""
        charge = RentCharge.objects.create(
            tenancy=self.tenancy,
            room=self.room1,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00"),
            paid_amount=Decimal("5000.00"),
            status="partial"
        )
        # Outstanding is 5,000. Try to pay 12,000.
        res = self.client.post('/api/v1/payments/', {
            'roomId': self.room1.id,
            'chargeId': charge.id,
            'amount': '12000.00',
            'method': 'mpesa',
            'reference': 'OVERPAY_REF_01',
            'paymentDate': '2026-10-15'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('10000.00'))
        payment = Payment.objects.get(reference='OVERPAY_REF_01')
        self.assertEqual(payment.amount, Decimal('12000.00'))
        self.assertEqual(sum((a.amount for a in payment.allocations.all()), Decimal('0.00')), Decimal('5000.00'))
        self.assertEqual(res.data['availableCredit'], Decimal('7000.00'))

    def test_payment_spillover_across_multiple_charges(self):
        """Payment allocates up to primary charge balance, and spills over to next unpaid charge."""
        charge1 = RentCharge.objects.create(
            tenancy=self.tenancy,
            room=self.room1,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00"),
            paid_amount=Decimal("6000.00"),
            status="partial"
        ) # Balance: 4,000
        charge2 = RentCharge.objects.create(
            tenancy=self.tenancy,
            room=self.room1,
            month="2026-11",
            due_date=date(2026, 11, 25),
            amount=Decimal("10000.00"),
            paid_amount=Decimal("0.00"),
            status="unpaid"
        ) # Balance: 10,000

        # Pay 9,000 targeting charge1: 4,000 to charge1, 5,000 to charge2
        res = self.client.post('/api/v1/payments/', {
            'roomId': self.room1.id,
            'chargeId': charge1.id,
            'amount': '9000.00',
            'method': 'mpesa',
            'reference': 'SPILLOVER_REF_01',
            'paymentDate': '2026-11-02'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        charge1.refresh_from_db()
        charge2.refresh_from_db()
        self.assertEqual(charge1.paid_amount, Decimal("10000.00"))
        self.assertEqual(charge1.status, "paid")
        self.assertEqual(charge2.paid_amount, Decimal("5000.00"))
        self.assertEqual(charge2.status, "partial")
        self.assertEqual(charge2.balance, Decimal("5000.00"))

        # Verify allocations sum exactly to payment amount
        payment = Payment.objects.get(reference='SPILLOVER_REF_01')
        allocs = payment.allocations.all()
        self.assertEqual(allocs.count(), 2)
        total_allocated = sum(a.amount for a in allocs)
        self.assertEqual(total_allocated, Decimal("9000.00"))

    def test_cannot_move_out_ended_tenancy(self):
        """Moving out an already ended tenancy is rejected."""
        # First move-out succeeds
        res1 = self.client.post(f'/api/v1/tenancies/{self.tenancy.id}/move-out/', {
            'endDate': '2026-10-31',
            'notes': 'Normal departure'
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        self.tenancy.refresh_from_db()
        self.assertEqual(self.tenancy.status, 'ended')

        # Second move-out attempt must be rejected
        res2 = self.client.post(f'/api/v1/tenancies/{self.tenancy.id}/move-out/', {
            'endDate': '2026-11-05',
            'notes': 'Second attempt'
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue('error' in res2.data or 'endDate' in res2.data)

    def test_cannot_register_tenant_with_existing_active_tenancy(self):
        """A tenant with an active tenancy cannot be registered into another room simultaneously."""
        # Alice already has active tenancy in Room 01. Try to register Alice into Room 02.
        res = self.client.post('/api/v1/tenancies/register/', {
            'fullName': 'Alice Test',
            'phone': '+254 700 111 222',
            'roomId': self.room2.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '10000.00'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone', res.data)

    def test_property_settings_due_day_boundaries(self):
        """defaultDueDay must be strictly between 1 and 28."""
        # Zero due day rejected
        res_zero = self.client.patch('/api/v1/settings/', {'defaultDueDay': 0}, format='json')
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # >28 rejected
        res_high = self.client.patch('/api/v1/settings/', {'defaultDueDay': 32}, format='json')
        self.assertEqual(res_high.status_code, status.HTTP_400_BAD_REQUEST)

        # Negative rejected
        res_neg = self.client.patch('/api/v1/settings/', {'defaultDueDay': -5}, format='json')
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid due day accepted
        res_ok = self.client.patch('/api/v1/settings/', {'defaultDueDay': 10}, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.default_due_day, 10)

    def test_room_default_rent_must_be_positive(self):
        """Room default rent must be greater than zero."""
        # Via settings roomRents
        res_bad = self.client.patch('/api/v1/settings/', {
            'roomRents': {'01': '-5000'}
        }, format='json')
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

        res_zero = self.client.patch('/api/v1/settings/', {
            'roomRents': {'01': '0'}
        }, format='json')
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # Direct room patch
        res_room_neg = self.client.patch(f'/api/v1/rooms/{self.room1.id}/', {
            'defaultRent': '-1000.00'
        }, format='json')
        self.assertEqual(res_room_neg.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_patch_room_to_vacant_with_active_tenancy(self):
        """A room cannot be manually patched to vacant while an active tenancy exists."""
        res = self.client.patch(f'/api/v1/rooms/{self.room1.id}/', {
            'status': 'vacant'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.room1.refresh_from_db()
        self.assertEqual(self.room1.status, 'occupied')

    def test_expense_amount_must_be_positive(self):
        """Expense amount cannot be zero or negative."""
        res_neg = self.client.post('/api/v1/expenses/', {
            'category': 'cleaning',
            'title': 'Compound Cleaning',
            'amount': '-1500.00',
            'date': '2026-10-15',
            'method': 'cash'
        }, format='json')
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

        res_zero = self.client.post('/api/v1/expenses/', {
            'category': 'cleaning',
            'title': 'Compound Cleaning',
            'amount': '0.00',
            'date': '2026-10-15',
            'method': 'cash'
        }, format='json')
        self.assertEqual(res_zero.status_code, status.HTTP_400_BAD_REQUEST)

        # Positive succeeds
        res_ok = self.client.post('/api/v1/expenses/', {
            'category': 'cleaning',
            'title': 'Compound Cleaning',
            'amount': '1500.00',
            'date': '2026-10-15',
            'method': 'cash'
        }, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
