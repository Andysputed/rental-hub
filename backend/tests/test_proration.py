from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.properties.models import Property, PropertySettings, Room
from apps.rent.models import RentCharge
from apps.rent.services import calculate_month_charge_amount, generate_monthly_charges
from apps.tenants.models import Tenant, Tenancy


class FirstMonthProrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(
            username='proration-landlord', email='proration@example.com', password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        self.property = Property.objects.create(name='Acacia', location='Nairobi', currency='KES')
        PropertySettings.objects.create(
            property=self.property, landlord_name='Landlord', landlord_initials='LL',
        )
        self.room = Room.objects.create(
            property=self.property, number='01', name='Room 01',
            default_rent=Decimal('10000.00'), status='occupied',
        )
        self.tenant = Tenant.objects.create(full_name='Proration Tenant', phone='+254700000010')

    def make_tenancy(self, start_date, monthly_rent='10000.00'):
        return Tenancy.objects.create(
            tenant=self.tenant, room=self.room, start_date=start_date,
            monthly_rent=Decimal(monthly_rent), deposit=Decimal('0.00'),
            rent_due_day=5, status='active',
        )

    def charge(self, tenancy, month):
        return RentCharge.objects.get(tenancy=tenancy, month=month)

    def test_move_in_on_first_day_charges_full_month(self):
        tenancy = self.make_tenancy(date(2026, 11, 1))
        created, _, total = generate_monthly_charges('2026-11', self.property)
        self.assertEqual(created, 1)
        charge = self.charge(tenancy, '2026-11')
        self.assertEqual(charge.amount, Decimal('10000.00'))
        self.assertEqual(total, Decimal('10000.00'))

    def test_mid_month_move_in_on_30_day_month_is_prorated(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        generate_monthly_charges('2026-11', self.property)
        self.assertEqual(self.charge(tenancy, '2026-11').amount, Decimal('5000.00'))

    def test_mid_month_move_in_on_31_day_month_is_prorated(self):
        tenancy = self.make_tenancy(date(2026, 10, 16))
        generate_monthly_charges('2026-10', self.property)
        # 16 of 31 days.
        self.assertEqual(self.charge(tenancy, '2026-10').amount, Decimal('5161.29'))

    def test_february_common_year_uses_28_days(self):
        tenancy = self.make_tenancy(date(2026, 2, 15))
        generate_monthly_charges('2026-02', self.property)
        # 14 of 28 days.
        self.assertEqual(self.charge(tenancy, '2026-02').amount, Decimal('5000.00'))

    def test_february_leap_year_uses_29_days(self):
        tenancy = self.make_tenancy(date(2028, 2, 15))
        generate_monthly_charges('2028-02', self.property)
        # 15 of 29 days.
        self.assertEqual(self.charge(tenancy, '2028-02').amount, Decimal('5172.41'))

    def test_move_in_on_last_day_charges_one_day(self):
        tenancy = self.make_tenancy(date(2026, 11, 30))
        generate_monthly_charges('2026-11', self.property)
        self.assertEqual(self.charge(tenancy, '2026-11').amount, Decimal('333.33'))

    def test_second_month_uses_full_rent(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        generate_monthly_charges('2026-11', self.property)
        generate_monthly_charges('2026-12', self.property)
        self.assertEqual(self.charge(tenancy, '2026-11').amount, Decimal('5000.00'))
        self.assertEqual(self.charge(tenancy, '2026-12').amount, Decimal('10000.00'))

    def test_repeated_generation_is_idempotent(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        first_created, _, first_total = generate_monthly_charges('2026-11', self.property)
        second_created, second_skipped, second_total = generate_monthly_charges('2026-11', self.property)
        self.assertEqual(first_created, 1)
        self.assertEqual(first_total, Decimal('5000.00'))
        self.assertEqual(second_created, 0)
        self.assertEqual(second_skipped, 1)
        self.assertEqual(second_total, Decimal('0.00'))
        self.assertEqual(RentCharge.objects.filter(tenancy=tenancy, month='2026-11').count(), 1)
        self.assertEqual(self.charge(tenancy, '2026-11').amount, Decimal('5000.00'))

    def test_partial_payment_leaves_correct_outstanding_balance(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        generate_monthly_charges('2026-11', self.property)
        self.client.post('/api/v1/payments/', {
            'tenancyId': tenancy.id, 'roomId': self.room.id,
            'amount': '2000.00', 'method': 'cash',
            'reference': 'PRORATION-PARTIAL', 'paymentDate': '2026-11-20',
        }, format='json')
        charge = self.charge(tenancy, '2026-11')
        charge.refresh_from_db()
        self.assertEqual(charge.amount, Decimal('5000.00'))
        self.assertEqual(charge.paid_amount, Decimal('2000.00'))
        self.assertEqual(charge.balance, Decimal('3000.00'))
        self.assertIn(charge.status, ('partial', 'overdue'))

    def test_payment_allocation_settles_prorated_charge(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        generate_monthly_charges('2026-11', self.property)
        response = self.client.post('/api/v1/payments/', {
            'tenancyId': tenancy.id, 'roomId': self.room.id,
            'amount': '5000.00', 'method': 'mpesa',
            'reference': 'PRORATION-FULL', 'paymentDate': '2026-11-20',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        charge = self.charge(tenancy, '2026-11')
        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('5000.00'))
        self.assertEqual(charge.balance, Decimal('0.00'))
        self.assertEqual(charge.status, 'paid')

    def test_historical_charges_are_not_recalculated(self):
        tenancy = self.make_tenancy(date(2026, 10, 16))
        generate_monthly_charges('2026-10', self.property)
        october = self.charge(tenancy, '2026-10')
        october_amount = october.amount
        october_id = october.id

        generate_monthly_charges('2026-10', self.property)
        generate_monthly_charges('2026-11', self.property)

        october.refresh_from_db()
        self.assertEqual(october.id, october_id)
        self.assertEqual(october.amount, october_amount)
        self.assertEqual(october.amount, Decimal('5161.29'))
        self.assertEqual(self.charge(tenancy, '2026-11').amount, Decimal('10000.00'))

    def test_future_start_tenancy_is_not_charged_before_it_starts(self):
        tenancy = self.make_tenancy(date(2026, 12, 10))
        created, _, _ = generate_monthly_charges('2026-11', self.property)
        self.assertEqual(created, 0)
        self.assertFalse(RentCharge.objects.filter(tenancy=tenancy, month='2026-11').exists())

        generate_monthly_charges('2026-12', self.property)
        # 22 of 31 days from 10 December.
        self.assertEqual(self.charge(tenancy, '2026-12').amount, Decimal('7096.77'))

    def test_calculation_helper_reports_days_used(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        amount, chargeable, total = calculate_month_charge_amount(tenancy, 2026, 11)
        self.assertEqual(amount, Decimal('5000.00'))
        self.assertEqual(chargeable, 15)
        self.assertEqual(total, 30)

        later, chargeable_later, total_later = calculate_month_charge_amount(tenancy, 2026, 12)
        self.assertEqual(later, Decimal('10000.00'))
        self.assertEqual(chargeable_later, 31)
        self.assertEqual(total_later, 31)

    def test_prorated_charge_due_date_is_not_before_move_in(self):
        tenancy = self.make_tenancy(date(2026, 11, 16))
        generate_monthly_charges('2026-11', self.property)
        self.assertEqual(self.charge(tenancy, '2026-11').due_date, date(2026, 11, 16))
        generate_monthly_charges('2026-12', self.property)
        self.assertEqual(self.charge(tenancy, '2026-12').due_date, date(2026, 12, 5))

    def test_payment_before_generation_creates_prorated_first_month_charge(self):
        tenancy = self.make_tenancy(date(2026, 11, 13), '8500.00')
        response = self.client.post('/api/v1/payments/', {
            'tenancyId': tenancy.id, 'roomId': self.room.id,
            'amount': '5100.00', 'method': 'mpesa',
            'reference': 'PRORATION-FIRST-MONTH', 'paymentDate': '2026-11-13',
            'allocationMode': 'automatic', 'chargeMonth': '2026-11',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        charge = self.charge(tenancy, '2026-11')
        self.assertEqual(charge.amount, Decimal('5100.00'))
        self.assertEqual(charge.due_date, date(2026, 11, 13))
        self.assertEqual(charge.paid_amount, Decimal('5100.00'))
        self.assertEqual(charge.balance, Decimal('0.00'))
        self.assertEqual(charge.status, 'paid')
        self.assertEqual(RentCharge.objects.filter(tenancy=tenancy).count(), 1)

        receipt = self.client.get(f"/api/v1/payments/{response.data['id']}/receipt/")
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(receipt.data['allocation']['chargeAmount'], 5100.0)
        self.assertEqual(receipt.data['allocation']['balanceAfter'], 0.0)

        generate_monthly_charges('2026-12', self.property)
        december = self.charge(tenancy, '2026-12')
        self.assertEqual(december.amount, Decimal('8500.00'))
        self.assertEqual(december.due_date, date(2026, 12, 5))
        self.assertEqual(december.paid_amount, Decimal('0.00'))

    def test_payment_does_not_duplicate_an_existing_first_month_charge(self):
        tenancy = self.make_tenancy(date(2026, 11, 13), '8500.00')
        generate_monthly_charges('2026-11', self.property)
        response = self.client.post('/api/v1/payments/', {
            'tenancyId': tenancy.id, 'roomId': self.room.id,
            'amount': '5100.00', 'method': 'cash',
            'reference': 'PRORATION-NO-DUPLICATE', 'paymentDate': '2026-11-13',
            'allocationMode': 'automatic', 'chargeMonth': '2026-11',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(RentCharge.objects.filter(tenancy=tenancy, month='2026-11').count(), 1)

        charge = self.charge(tenancy, '2026-11')
        self.assertEqual(charge.amount, Decimal('5100.00'))
        self.assertEqual(charge.paid_amount, Decimal('5100.00'))

    def test_payment_rejects_charge_month_outside_the_tenancy(self):
        tenancy = self.make_tenancy(date(2026, 11, 13))
        response = self.client.post('/api/v1/payments/', {
            'tenancyId': tenancy.id, 'roomId': self.room.id,
            'amount': '5100.00', 'method': 'cash',
            'reference': 'PRORATION-OUTSIDE', 'paymentDate': '2026-11-13',
            'allocationMode': 'automatic', 'chargeMonth': '2026-10',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('chargeMonth', response.data)

    def test_prorated_charge_is_returned_by_charges_api_in_its_billing_month(self):
        tenancy = self.make_tenancy(date(2026, 11, 13), '8500.00')
        generate_monthly_charges('2026-11', self.property)
        generate_monthly_charges('2026-12', self.property)

        november = self.client.get('/api/v1/rent-charges/', {'month': '2026-11'})
        self.assertEqual(november.status_code, 200)
        rows = november.data['results']
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(str(row['tenancyId']), str(tenancy.id))
        self.assertEqual(str(row['roomId']), str(self.room.id))
        self.assertEqual(row['roomName'], 'Room 01')
        self.assertEqual(row['tenantName'], 'Proration Tenant')
        self.assertEqual(row['month'], '2026-11')
        self.assertEqual(row['dueDate'], '2026-11-13')
        self.assertEqual(Decimal(str(row['amount'])), Decimal('5100.00'))
        self.assertEqual(Decimal(str(row['paidAmount'])), Decimal('0.00'))
        self.assertEqual(Decimal(str(row['balance'])), Decimal('5100.00'))

        december = self.client.get('/api/v1/rent-charges/', {'month': '2026-12'})
        self.assertEqual(december.status_code, 200)
        rows = december.data['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['month'], '2026-12')
        self.assertEqual(rows[0]['dueDate'], '2026-12-05')
        self.assertEqual(Decimal(str(rows[0]['amount'])), Decimal('8500.00'))

    def test_generate_endpoint_returns_prorated_charge_for_move_in_month(self):
        self.make_tenancy(date(2026, 11, 13), '8500.00')
        response = self.client.post(
            '/api/v1/rent-charges/generate/', {'month': '2026-11'}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['createdCount'], 1)
        self.assertEqual(len(response.data['charges']), 1)
        charge = response.data['charges'][0]
        self.assertEqual(charge['month'], '2026-11')
        self.assertEqual(charge['tenantName'], 'Proration Tenant')
        self.assertEqual(charge['roomName'], 'Room 01')
        self.assertEqual(charge['dueDate'], '2026-11-13')
        self.assertEqual(Decimal(str(charge['amount'])), Decimal('5100.00'))
