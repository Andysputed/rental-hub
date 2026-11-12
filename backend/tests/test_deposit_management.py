from datetime import date
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.payments.models import Deposit, DepositPayment, Payment, PaymentAllocation
from apps.rent.models import RentCharge


class DepositPaymentManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(
            username='deposit_admin', email='deposit@example.com', password='testpass123!'
        )
        self.client.force_authenticate(user=self.user)

        self.property = Property.objects.create(name='Acacia House', location='Nairobi', currency='KES')
        self.settings = PropertySettings.objects.create(
            property=self.property,
            landlord_name='Veronicah K.',
            landlord_initials='VK',
            default_due_day=5,
        )
        self.room1 = Room.objects.create(
            property=self.property, number='01', name='Room 01', default_rent=Decimal('8500.00'), status='vacant'
        )
        self.room2 = Room.objects.create(
            property=self.property, number='02', name='Room 02', default_rent=Decimal('8500.00'), status='vacant'
        )
        self.room3 = Room.objects.create(
            property=self.property, number='03', name='Room 03', default_rent=Decimal('8500.00'), status='vacant'
        )

    def test_movein_with_zero_deposit_paid(self):
        """1: Required deposit 8,500; paid 0; outstanding 8,500; status unpaid."""
        payload = {
            'fullName': 'Zero Paid Tenant',
            'phone': '+254711000001',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '0.00',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        tenancy = Tenancy.objects.get(tenant__phone='+254711000001')
        deposit = tenancy.deposits.first()
        self.assertIsNotNone(deposit)
        self.assertEqual(deposit.required_amount, Decimal('8500.00'))
        self.assertEqual(deposit.amount, Decimal('0.00'))
        self.assertEqual(deposit.total_paid, Decimal('0.00'))
        self.assertEqual(deposit.outstanding_balance, Decimal('8500.00'))
        self.assertEqual(deposit.status, 'unpaid')
        self.assertIsNone(deposit.received_date)
        self.assertEqual(deposit.payments.count(), 0)

    def test_movein_with_partial_deposit_paid(self):
        """2: Required deposit 8,500; paid 5,000; outstanding 3,500; status partially_paid."""
        payload = {
            'fullName': 'Partial Paid Tenant',
            'phone': '+254711000002',
            'roomId': self.room2.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '5000.00',
            'depositMethod': 'mpesa',
            'depositReference': 'DEP-PART-01',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        tenancy = Tenancy.objects.get(tenant__phone='+254711000002')
        deposit = tenancy.deposits.first()
        self.assertIsNotNone(deposit)
        self.assertEqual(deposit.required_amount, Decimal('8500.00'))
        self.assertEqual(deposit.amount, Decimal('5000.00'))
        self.assertEqual(deposit.total_paid, Decimal('5000.00'))
        self.assertEqual(deposit.outstanding_balance, Decimal('3500.00'))
        self.assertEqual(deposit.status, 'partially_paid')
        self.assertEqual(deposit.payments.count(), 1)
        p = deposit.payments.first()
        self.assertEqual(p.amount, Decimal('5000.00'))
        self.assertEqual(p.reference, 'DEP-PART-01')

    def test_movein_with_full_deposit_paid(self):
        """3: Required deposit 8,500; paid 8,500; outstanding 0; status held."""
        payload = {
            'fullName': 'Full Paid Tenant',
            'phone': '+254711000003',
            'roomId': self.room3.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '8500.00',
            'depositMethod': 'cash',
            'depositReference': 'CASH-DEP-03',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        tenancy = Tenancy.objects.get(tenant__phone='+254711000003')
        deposit = tenancy.deposits.first()
        self.assertIsNotNone(deposit)
        self.assertEqual(deposit.required_amount, Decimal('8500.00'))
        self.assertEqual(deposit.amount, Decimal('8500.00'))
        self.assertEqual(deposit.total_paid, Decimal('8500.00'))
        self.assertEqual(deposit.outstanding_balance, Decimal('0.00'))
        self.assertEqual(deposit.status, 'held')

    def test_deposit_explicitly_waived_with_reason(self):
        """4: Deposit waived with reason."""
        payload = {
            'fullName': 'Waived Tenant',
            'phone': '+254711000004',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '0.00',
            'depositWaived': True,
            'depositWaivedReason': 'Family relative agreement',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        tenancy = Tenancy.objects.get(tenant__phone='+254711000004')
        deposit = tenancy.deposits.first()
        self.assertIsNotNone(deposit)
        self.assertTrue(deposit.is_waived)
        self.assertEqual(deposit.waived_reason, 'Family relative agreement')
        self.assertEqual(deposit.status, 'waived')
        self.assertEqual(deposit.outstanding_balance, Decimal('0.00'))
        self.assertIsNotNone(deposit.waived_at)

    def test_waive_without_reason_rejected(self):
        """Waiving deposit without reason returns 400 validation error."""
        payload = {
            'fullName': 'No Reason Waive',
            'phone': '+254711000005',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositWaived': True,
            'depositWaivedReason': '',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('depositWaivedReason', res.data)

    def test_deposit_paid_exceeding_required_rejected(self):
        """Deposit paid > required is rejected with 400."""
        payload = {
            'fullName': 'Overpaying Tenant',
            'phone': '+254711000006',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '9000.00',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('depositPaid', res.data)

    def test_record_subsequent_deposit_payment(self):
        """7 & 8: Record subsequent payment on partial deposit until balance reaches 0."""
        # 1. Register with partial deposit 5,000 out of 8,500
        payload = {
            'fullName': 'Subsequent Tenant',
            'phone': '+254711000007',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '5000.00',
        }
        res = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        tenancy = Tenancy.objects.get(tenant__phone='+254711000007')
        deposit = tenancy.deposits.first()
        self.assertEqual(deposit.outstanding_balance, Decimal('3500.00'))

        # 2. Record 2,000 partial payment
        pay_res = self.client.post(f'/api/v1/deposits/{deposit.id}/record-payment/', {
            'amount': '2000.00',
            'paymentDate': '2026-11-10',
            'method': 'mpesa',
            'reference': 'DEP-SUB-01',
            'notes': 'Installment 2',
        }, format='json')
        self.assertEqual(pay_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(pay_res.data['totalPaid'])), Decimal('7000.00'))
        self.assertEqual(Decimal(str(pay_res.data['outstandingBalance'])), Decimal('1500.00'))
        self.assertEqual(pay_res.data['status'], 'partially_paid')

        # 3. Attempt to overpay remaining 1,500 with 2,000 -> rejected
        over_res = self.client.post(f'/api/v1/deposits/{deposit.id}/record-payment/', {
            'amount': '2000.00',
            'paymentDate': '2026-11-15',
            'method': 'cash',
        }, format='json')
        self.assertEqual(over_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Pay remaining 1,500 -> reaches 0 and status becomes 'held'
        final_res = self.client.post(f'/api/v1/deposits/{deposit.id}/record-payment/', {
            'amount': '1500.00',
            'paymentDate': '2026-11-15',
            'method': 'cash',
            'reference': 'DEP-SUB-02',
        }, format='json')
        self.assertEqual(final_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(final_res.data['totalPaid'])), Decimal('8500.00'))
        self.assertEqual(Decimal(str(final_res.data['outstandingBalance'])), Decimal('0.00'))
        self.assertEqual(final_res.data['status'], 'held')
        self.assertEqual(len(final_res.data['payments']), 3)

    def test_financial_isolation_from_rent_ledger(self):
        """14, 15, 16: Deposit payments do not touch rent charges, payments or allocations."""
        payload = {
            'fullName': 'Isolated Tenant',
            'phone': '+254711000008',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '0.00',
        }
        self.client.post('/api/v1/tenancies/register/', payload, format='json')
        tenancy = Tenancy.objects.get(tenant__phone='+254711000008')
        deposit = tenancy.deposits.first()

        # Create the November rent charge directly; deposit payments must leave
        # that existing charge untouched.
        charge = RentCharge.objects.create(
            tenancy=tenancy,
            room=self.room1,
            month='2026-11',
            due_date=date(2026, 11, 5),
            amount=Decimal('8500.00'),
            paid_amount=Decimal('0.00'),
            status='unpaid',
        )
        original_status = charge.status

        # Record deposit payment
        self.client.post(f'/api/v1/deposits/{deposit.id}/record-payment/', {
            'amount': '8500.00',
            'paymentDate': '2026-11-02',
            'method': 'mpesa',
            'reference': 'DEP-ONLY-01',
        }, format='json')

        # Charge must remain completely unpaid
        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('0.00'))
        self.assertEqual(charge.status, original_status)
        self.assertEqual(Payment.objects.filter(tenancy=tenancy).count(), 0)
        self.assertEqual(PaymentAllocation.objects.filter(charge=charge).count(), 0)

    def test_moveout_deductions_capped_at_actual_deposit_held(self):
        """Move-out settlement deduction cannot exceed actual deposit held."""
        payload = {
            'fullName': 'Moveout Tenant',
            'phone': '+254711000009',
            'roomId': self.room1.id,
            'moveInDate': '2026-11-01',
            'monthlyRent': '8500.00',
            'depositRequired': '8500.00',
            'depositPaid': '3000.00',
        }
        self.client.post('/api/v1/tenancies/register/', payload, format='json')
        tenancy = Tenancy.objects.get(tenant__phone='+254711000009')
        deposit = tenancy.deposits.first()

        # Attempt to retain 5,000 against repairs when only 3,000 was held -> rejected
        res = self.client.post(f'/api/v1/deposits/{deposit.id}/settle/', {
            'repairDeductions': [{'description': 'Broken door', 'amount': '5000.00', 'category': 'repair'}],
            'refundAmount': '0.00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('totalDeductions', res.data)
