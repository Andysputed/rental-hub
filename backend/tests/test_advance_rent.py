from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.payments.ledger import payment_available_credit
from apps.payments.models import Deposit, Payment, PaymentAllocation, PaymentRefund, PaymentReversal
from apps.payments.serializers import DepositSettlementSerializer
from apps.properties.models import Property, PropertySettings, Room
from apps.rent.models import RentCharge
from apps.rent.services import generate_monthly_charges
from apps.tenants.models import Tenant, Tenancy


class AdvanceRentLedgerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser(
            username='advance-landlord', email='advance@example.com', password='testpass123'
        ))
        self.property = Property.objects.create(id=1, name='Acacia', location='Nairobi', currency='KES')
        PropertySettings.objects.create(property=self.property, landlord_name='Landlord', landlord_initials='LL')
        self.room = Room.objects.create(
            property=self.property, number='01', name='Room 01',
            default_rent=Decimal('8500.00'), status='occupied',
        )
        self.tenant = Tenant.objects.create(full_name='Advance Tenant', phone='+254700000001')
        self.tenancy = Tenancy.objects.create(
            tenant=self.tenant, room=self.room, start_date=date(2026, 11, 1),
            monthly_rent=Decimal('8500.00'), deposit=Decimal('0.00'),
            rent_due_day=5, status='active',
        )

    def record(self, amount, reference, *, date_value='2026-10-20', **extra):
        payload = {
            'roomId': self.room.id, 'tenancyId': self.tenancy.id,
            'amount': str(amount), 'method': 'mpesa',
            'reference': reference, 'paymentDate': date_value,
        }
        payload.update(extra)
        return self.client.post('/api/v1/payments/', payload, format='json')

    def test_november_tenancy_has_no_october_charge(self):
        created, _, _ = generate_monthly_charges('2026-10', self.property)
        self.assertEqual(created, 0)
        self.assertFalse(RentCharge.objects.filter(tenancy=self.tenancy, month='2026-10').exists())

    def test_moveout_arrears_exclude_not_yet_due_future_months(self):
        future = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-12',
            due_date=date(2026, 12, 5), amount=Decimal('8500.00'),
        )
        response = self.client.get(f'/api/v1/tenancies/{self.tenancy.id}/settlement-summary/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['eligibleArrears']['total'], 0.0)
        self.assertFalse(any(item['id'] == future.id for item in response.data['eligibleArrears']['charges']))

    def test_deposit_settlement_rejects_deduction_for_future_due_charge(self):
        RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-12',
            due_date=date(2026, 12, 5), amount=Decimal('8500.00'),
        )
        deposit = Deposit.objects.create(
            tenancy=self.tenancy, tenant=self.tenant, required_amount=Decimal('8500.00'),
            amount=Decimal('8500.00'), received_date=date(2026, 11, 1), status='held',
        )
        serializer = DepositSettlementSerializer(
            data={
                'endDate': '2026-11-11',
                'rentDeduction': '8500.00',
                'repairDeductions': [],
                'refundAmount': '0.00',
            },
            context={'tenancy': self.tenancy, 'deposit': deposit},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('rentDeduction', serializer.errors)

    def test_pre_movein_receipt_does_not_create_prior_charge_and_is_credit(self):
        response = self.record('5000.00', 'ADVANCE-001')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(RentCharge.objects.filter(tenancy=self.tenancy, month='2026-10').exists())
        payment = Payment.objects.get(reference='ADVANCE-001')
        self.assertEqual(payment.allocations.count(), 0)
        self.assertEqual(payment_available_credit(payment), Decimal('5000.00'))

    def test_manual_future_reservation_applies_once_when_charge_generated(self):
        response = self.record(
            '9000.00', 'RESERVE-001', allocationMode='manual',
            allocations=[], reservations=[{'month': '2026-12', 'amount': '6000.00'}],
        )
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(reference='RESERVE-001')
        self.assertEqual(payment_available_credit(payment), Decimal('3000.00'))
        created, _, total = generate_monthly_charges('2026-12', self.property)
        self.assertEqual((created, total), (1, Decimal('8500.00')))
        charge = RentCharge.objects.get(tenancy=self.tenancy, month='2026-12')
        self.assertEqual(charge.paid_amount, Decimal('6000.00'))
        self.assertEqual(payment.allocations.get().amount, Decimal('6000.00'))
        self.assertEqual(payment_available_credit(payment), Decimal('3000.00'))
        generate_monthly_charges('2026-12', self.property)
        self.assertEqual(payment.allocations.count(), 1)

    def test_automatic_allocation_is_oldest_first_and_excess_is_credit(self):
        old = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-11',
            due_date=date(2026, 11, 5), amount=Decimal('8500.00'),
        )
        later = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-12',
            due_date=date(2026, 12, 5), amount=Decimal('8500.00'),
        )
        response = self.record('10000.00', 'OLDEST-001', date_value='2026-12-01')
        self.assertEqual(response.status_code, 201, response.data)
        old.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(old.paid_amount, Decimal('8500.00'))
        self.assertEqual(later.paid_amount, Decimal('1500.00'))
        self.assertEqual(response.data['availableCredit'], Decimal('0.00'))

    def test_manual_allocations_across_existing_charges_and_amount_caps(self):
        c1 = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-11',
            due_date=date(2026, 11, 5), amount=Decimal('8500.00'),
        )
        c2 = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-12',
            due_date=date(2026, 12, 5), amount=Decimal('8500.00'),
        )
        response = self.record('5000.00', 'MANUAL-001', allocationMode='manual', allocations=[
            {'chargeId': c1.id, 'amount': '2000.00'},
            {'chargeId': c2.id, 'amount': '3000.00'},
        ], reservations=[])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Payment.objects.get(reference='MANUAL-001').allocations.count(), 2)
        over = self.record('1000.00', 'MANUAL-OVER', allocationMode='manual', allocations=[
            {'chargeId': c1.id, 'amount': '1001.00'},
        ], reservations=[])
        self.assertEqual(over.status_code, 400)
        self.assertFalse(Payment.objects.filter(reference='MANUAL-OVER').exists())

    def test_reservation_can_be_cancelled_and_credit_restored(self):
        response = self.record('4000.00', 'CANCEL-001', allocationMode='manual', allocations=[],
                               reservations=[{'month': '2026-12', 'amount': '2500.00'}])
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(reference='CANCEL-001')
        reservation = payment.reservations.get()
        released = self.client.post(f'/api/v1/payments/{payment.id}/release-reservation/', {
            'reservationId': reservation.id, 'reason': 'Tenant changed requested month',
        }, format='json')
        self.assertEqual(released.status_code, 200, released.data)
        payment.refresh_from_db()
        self.assertEqual(payment_available_credit(payment), Decimal('4000.00'))

    def test_reversal_preserves_original_allocation_and_restores_charge(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-11',
            due_date=date(2026, 11, 5), amount=Decimal('8500.00'),
        )
        response = self.record('3000.00', 'REVERSE-001')
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(reference='REVERSE-001')
        original = PaymentAllocation.objects.get(payment=payment)
        result = self.client.post(f'/api/v1/payments/{payment.id}/reverse/', {'reason': 'Recorded in error'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        charge.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(charge.paid_amount, Decimal('0.00'))
        self.assertTrue(PaymentAllocation.objects.filter(pk=original.pk).exists())
        self.assertTrue(PaymentReversal.objects.filter(payment=payment).exists())
        duplicate = self.client.post(f'/api/v1/payments/{payment.id}/reverse/', {'reason': 'Duplicate reversal'}, format='json')
        self.assertEqual(duplicate.status_code, 400)

    def test_refund_is_separate_and_limited_to_available_credit(self):
        response = self.record('5000.00', 'REFUND-001')
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(reference='REFUND-001')
        result = self.client.post(f'/api/v1/payments/{payment.id}/refund/', {
            'amount': '2000.00', 'date': '2026-10-21', 'method': 'cash',
            'reference': 'REFUND-OUT-001', 'reason': 'Tenant returned advance',
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(PaymentRefund.objects.filter(payment=payment).count(), 1)
        self.assertEqual(payment_available_credit(payment), Decimal('3000.00'))
        too_much = self.client.post(f'/api/v1/payments/{payment.id}/refund/', {
            'amount': '4000.00', 'date': '2026-10-21', 'method': 'cash',
            'reference': 'REFUND-OUT-002', 'reason': 'Over refund attempt',
        }, format='json')
        self.assertEqual(too_much.status_code, 400)

    def test_unallocated_advance_credit_automatically_applies_when_new_month_charges_generated(self):
        # 1. Create November charge of 8500
        charge_nov = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-11',
            due_date=date(2026, 11, 5), amount=Decimal('8500.00'),
        )
        # 2. Record 17,000 payment (covers November + 8500 advance credit)
        res = self.record('17000.00', 'AUTO-17K', date_value='2026-11-04')
        self.assertEqual(res.status_code, 201)
        charge_nov.refresh_from_db()
        self.assertEqual(charge_nov.paid_amount, Decimal('8500.00'))
        self.assertEqual(charge_nov.status, 'paid')
        payment = Payment.objects.get(reference='AUTO-17K')
        self.assertEqual(payment_available_credit(payment), Decimal('8500.00'))

        # 3. Generate December charges
        created, skipped, total = generate_monthly_charges('2026-12', self.property)
        self.assertEqual(created, 1)
        charge_dec = RentCharge.objects.get(tenancy=self.tenancy, month='2026-12')
        self.assertEqual(charge_dec.paid_amount, Decimal('8500.00'))
        self.assertEqual(charge_dec.balance, Decimal('0.00'))
        self.assertEqual(charge_dec.status, 'paid')
        self.assertEqual(payment_available_credit(payment), Decimal('0.00'))

    def test_advance_credit_reconciles_unpaid_existing_charges_on_payment(self):
        # 1. Unpaid November charge
        charge_nov = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.room, month='2026-11',
            due_date=date(2026, 11, 5), amount=Decimal('8500.00'),
        )
        # 2. Manual payment with December reservation for 8500 out of 17000
        res = self.record('17000.00', 'MANUAL-17K', date_value='2026-11-04',
                          allocationMode='manual', allocations=[],
                          reservations=[{'month': '2026-12', 'amount': '8500.00'}])
        self.assertEqual(res.status_code, 201)
        # November charge should automatically be reconciled from the surplus 8500
        charge_nov.refresh_from_db()
        self.assertEqual(charge_nov.paid_amount, Decimal('8500.00'))
        self.assertEqual(charge_nov.status, 'paid')
        payment = Payment.objects.get(reference='MANUAL-17K')
        self.assertEqual(payment.reservations.get().status, 'reserved')
        self.assertEqual(payment_available_credit(payment), Decimal('0.00'))

