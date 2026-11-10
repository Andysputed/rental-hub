from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.payments.models import Deposit, DepositDeduction, Payment, PaymentAllocation, ReceiptSequence
from apps.properties.models import Property, Room
from apps.rent.models import RentCharge
from apps.tenants.models import Tenant, Tenancy
from apps.expenses.models import Expense


class AdversarialHardeningTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser(username='hardening', email='hardening@example.com', password='Safe-test-password-123!'))
        self.property = Property.objects.create(name='Isolated', location='Test')
        self.room = Room.objects.create(property=self.property, number='01', name='Room 01', status='occupied')
        self.room2 = Room.objects.create(property=self.property, number='02', name='Room 02')
        self.tenant = Tenant.objects.create(full_name='Case Tenant', phone='555-0100')
        self.tenancy = Tenancy.objects.create(
            tenant=self.tenant, room=self.room, start_date=date(2026, 1, 1),
            monthly_rent=Decimal('10000.00'), status='active',
        )

    def test_database_enforces_one_active_tenancy_per_tenant(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Tenancy.objects.create(
                tenant=self.tenant, room=self.room2, start_date=date(2026, 2, 1),
                monthly_rent=Decimal('10000.00'), status='active',
            )

    def test_receipt_sequence_uses_numeric_max_and_resets_by_year(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'),
        )
        Payment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy, room=self.room, charge=charge,
            receipt_number='RH-2026-999', amount=Decimal('1.00'), date=date(2026, 1, 2),
            method='cash', reference='legacy-999',
        )
        for year, expected, reference in ((2026, 'RH-2026-1000', 'new-1000'), (2027, 'RH-2027-001', 'new-year')):
            response = self.client.post('/api/v1/payments/', {
                'roomId': self.room.id, 'chargeId': charge.id, 'amount': '1.00',
                'method': 'cash', 'reference': reference, 'paymentDate': f'{year}-01-10',
            }, format='json')
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data['receiptNumber'], expected)

    def test_specific_month_allocation_does_not_leave_unallocated_balance(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'),
        )
        response = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'chargeId': charge.id, 'amount': '2500.25',
            'method': 'cash', 'reference': 'partial-exact', 'paymentDate': '2026-01-10',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(reference='partial-exact')
        self.assertEqual(sum(a.amount for a in payment.allocations.all()), payment.amount)
        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('2500.25'))

    def test_month_target_then_oldest_charge_first_spillover(self):
        oldest = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), paid_amount=Decimal('9000.00'), status='partial',
        )
        next_oldest = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-02', due_date=date(2026, 2, 5),
            amount=Decimal('10000.00'), status='unpaid',
        )
        targeted = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-03', due_date=date(2026, 3, 5),
            amount=Decimal('10000.00'), paid_amount=Decimal('9000.00'), status='partial',
        )
        response = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'chargeId': targeted.id, 'amount': '5000.00',
            'method': 'cash', 'reference': 'oldest-spillover-order', 'paymentDate': '2026-03-12',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        months = list(PaymentAllocation.objects.filter(payment_id=response.data['id'])
                      .order_by('created_at', 'id').values_list('charge__month', flat=True))
        self.assertEqual(months, ['2026-03', '2026-01', '2026-02'])

        # Without an explicit chargeId, the payment-date month is preferred;
        # if no charge exists for that month, the oldest outstanding charge wins.
        month_targeted = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'amount': '500.00', 'method': 'cash',
            'reference': 'payment-date-month-target', 'paymentDate': '2026-02-20',
        }, format='json')
        self.assertEqual(month_targeted.status_code, 201, month_targeted.data)
        self.assertEqual(month_targeted.data['chargeId'], next_oldest.id)

        oldest_fallback = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'amount': '500.00', 'method': 'cash',
            'reference': 'oldest-charge-fallback', 'paymentDate': '2026-04-20',
        }, format='json')
        self.assertEqual(oldest_fallback.status_code, 201, oldest_fallback.data)
        self.assertEqual(oldest_fallback.data['chargeId'], next_oldest.id)

    def test_payment_rejects_subcent_precision_without_rounding(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), status='unpaid',
        )
        invalid = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'chargeId': charge.id, 'amount': '1.005',
            'method': 'cash', 'reference': 'sub-cent-payment', 'paymentDate': '2026-01-10',
        }, format='json')
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(Payment.objects.filter(reference='sub-cent-payment').exists())

        valid = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'chargeId': charge.id, 'amount': '1.01',
            'method': 'cash', 'reference': 'cent-payment', 'paymentDate': '2026-01-10',
        }, format='json')
        self.assertEqual(valid.status_code, 201, valid.data)
        self.assertEqual(Payment.objects.get(reference='cent-payment').amount, Decimal('1.01'))
        self.assertEqual(PaymentAllocation.objects.get(payment__reference='cent-payment').amount, Decimal('1.01'))

    def test_spillover_receipt_reports_each_charge_allocation_and_balances(self):
        first = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), paid_amount=Decimal('6000.00'), status='partial',
        )
        prior_payment = Payment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy, room=self.room, charge=first,
            receipt_number='RH-2026-700', amount=Decimal('6000.00'), date=date(2026, 1, 2),
            method='cash', reference='receipt-spillover-prior',
        )
        PaymentAllocation.objects.create(payment=prior_payment, charge=first, amount=Decimal('6000.00'))
        second = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-02', due_date=date(2026, 2, 5),
            amount=Decimal('10000.00'), status='unpaid',
        )
        created = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'chargeId': first.id, 'amount': '9000.00',
            'method': 'cash', 'reference': 'receipt-spillover-audit', 'paymentDate': '2026-02-10',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)

        receipt = self.client.get(f"/api/v1/payments/{created.data['id']}/receipt/")
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(receipt.data['allocation']['amount'], 4000.0)
        self.assertEqual(receipt.data['allocation']['balanceBefore'], 4000.0)
        self.assertEqual(receipt.data['allocation']['balanceAfter'], 0.0)
        self.assertEqual(
            [(item['month'], item['amount'], item['balanceBefore'], item['balanceAfter'])
             for item in receipt.data['allocations']],
            [('2026-01', 4000.0, 4000.0, 0.0), ('2026-02', 5000.0, 10000.0, 5000.0)],
        )

    def test_midway_allocation_failure_rolls_back_payment_and_every_charge(self):
        first = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), paid_amount=Decimal('6000.00'),
        )
        second = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-02', due_date=date(2026, 2, 5),
            amount=Decimal('10000.00'),
        )
        actual_create = PaymentAllocation.objects.create
        calls = 0

        def fail_on_second_allocation(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError('simulated database failure after first allocation')
            return actual_create(*args, **kwargs)

        with patch.object(PaymentAllocation.objects, 'create', side_effect=fail_on_second_allocation):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/v1/payments/', {
                    'roomId': self.room.id, 'chargeId': first.id, 'amount': '9000.00',
                    'method': 'cash', 'reference': 'rollback-mid-allocation', 'paymentDate': '2026-01-10',
                }, format='json')

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.paid_amount, Decimal('6000.00'))
        self.assertEqual(second.paid_amount, Decimal('0.00'))
        self.assertFalse(Payment.objects.filter(reference='rollback-mid-allocation').exists())
        self.assertFalse(PaymentAllocation.objects.filter(payment__reference='rollback-mid-allocation').exists())

    def test_payment_history_cannot_be_deleted_through_api(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'),
        )
        response = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'chargeId': charge.id, 'amount': '1000.00',
            'method': 'cash', 'reference': 'immutable-history', 'paymentDate': '2026-01-10',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        deleted = self.client.delete(f"/api/v1/payments/{response.data['id']}/")
        self.assertEqual(deleted.status_code, 405)
        self.assertTrue(Payment.objects.filter(reference='immutable-history').exists())

    def test_payment_create_failure_rolls_back_sequence_and_payment(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'),
        )
        with patch.object(Payment.objects, 'create', side_effect=RuntimeError('simulated payment insert failure')):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/v1/payments/', {
                    'roomId': self.room.id, 'chargeId': charge.id, 'amount': '100.00',
                    'method': 'cash', 'reference': 'payment-create-failure', 'paymentDate': '2026-01-10',
                }, format='json')
        self.assertFalse(Payment.objects.filter(reference='payment-create-failure').exists())
        self.assertFalse(ReceiptSequence.objects.filter(year=2026).exists())
        charge.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('0.00'))

    def test_registration_failure_rolls_back_tenant_tenancy_and_room(self):
        with patch.object(Deposit.objects, 'create', side_effect=RuntimeError('simulated deposit write failure')):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/v1/tenancies/register/', {
                    'fullName': 'Registration Rollback', 'phone': '555-0199',
                    'roomId': self.room2.id, 'moveInDate': '2026-02-01',
                    'monthlyRent': '9000.00', 'deposit': '1000.00',
                }, format='json')
        self.assertFalse(Tenant.objects.filter(phone='555-0199').exists())
        self.assertFalse(Tenancy.objects.filter(room=self.room2, status='active').exists())
        self.room2.refresh_from_db()
        self.assertEqual(self.room2.status, 'vacant')

    def test_move_out_failure_rolls_back_tenancy_and_tenant_status(self):
        with patch.object(Room, 'save', side_effect=RuntimeError('simulated room status failure')):
            with self.assertRaises(RuntimeError):
                self.client.post(f'/api/v1/tenancies/{self.tenancy.id}/move-out/', {
                    'endDate': '2026-02-01',
                }, format='json')
        self.tenancy.refresh_from_db()
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenancy.status, 'active')
        self.assertEqual(self.tenant.status, 'active')

    def test_rent_generation_failure_rolls_back_created_charge(self):
        with patch.object(RentCharge, 'update_status', side_effect=RuntimeError('simulated charge update failure')):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/v1/rent-charges/generate/', {'month': '2026-03'}, format='json')
        self.assertFalse(RentCharge.objects.filter(tenancy=self.tenancy, month='2026-03').exists())

    def test_deposit_refund_failure_rolls_back_deduction_and_tenancy(self):
        deposit = Deposit.objects.create(
            tenancy=self.tenancy, tenant=self.tenant, amount=Decimal('10000.00'),
            received_date=date(2026, 1, 1),
        )
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), paid_amount=Decimal('6000.00'),
        )
        with patch.object(DepositDeduction.objects, 'create', side_effect=RuntimeError('simulated deduction failure')):
            with self.assertRaises(RuntimeError):
                self.client.post(f'/api/v1/deposits/{deposit.id}/settle/', {
                    'rentDeduction': '4000.00', 'refundAmount': '6000.00', 'refundMethod': 'cash',
                }, format='json')
        deposit.refresh_from_db()
        charge.refresh_from_db()
        self.tenancy.refresh_from_db()
        self.assertEqual(deposit.status, 'held')
        self.assertEqual(charge.paid_amount, Decimal('6000.00'))
        self.assertEqual(self.tenancy.status, 'active')
        self.assertFalse(DepositDeduction.objects.filter(deposit=deposit).exists())

    def test_expense_create_failure_leaves_no_record(self):
        with patch.object(Expense.objects, 'create', side_effect=RuntimeError('simulated expense insert failure')):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/v1/expenses/', {
                    'category': 'maintenance', 'title': 'Failure injection',
                    'amount': '125.50', 'date': '2026-02-01', 'method': 'cash',
                }, format='json')
        self.assertFalse(Expense.objects.filter(title='Failure injection').exists())

    def test_future_dated_payment_currently_creates_future_month_charge(self):
        response = self.client.post('/api/v1/payments/', {
            'roomId': self.room.id, 'amount': '10000.00', 'method': 'cash',
            'reference': 'future-rent-policy', 'paymentDate': '2028-04-10',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(RentCharge.objects.filter(tenancy=self.tenancy, month='2028-04').exists())
