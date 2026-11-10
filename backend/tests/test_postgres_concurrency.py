"""Genuine PostgreSQL concurrency tests; never run against the configured live DB."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import os
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth.models import User
from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from unittest.mock import patch

from apps.payments.models import Payment, PaymentAllocation
from apps.payments.models import Deposit
from apps.payments.serializers import RecordPaymentSerializer
from apps.properties.models import Property, Room
from apps.rent.models import RentCharge
from apps.tenants.models import Tenant, Tenancy


ISOLATED_AUDIT_DB = os.getenv('RENTALHUB_AUDIT_DB_NAME') == 'rentalhub_audit_test_20261109_7d914a3f'


@skipUnless(connection.vendor == 'postgresql' and ISOLATED_AUDIT_DB,
             'Requires the explicitly isolated PostgreSQL audit test database.')
class PostgreSQLConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.user = User.objects.create_superuser(
            username='pg-audit-landlord', email='pg-audit@example.test', password='unused-test-password',
        )
        self.property = Property.objects.create(id=1, name='Concurrency Test Property', location='Test')
        self.rooms = [
            Room.objects.create(property=self.property, number=f'{i:02}', name=f'Room {i:02}', status='vacant')
            for i in range(1, 5)
        ]
        self.tenant = Tenant.objects.create(full_name='Existing Tenant', phone='+254700000001')
        self.tenancy = Tenancy.objects.create(
            tenant=self.tenant, room=self.rooms[0], start_date=date(2026, 1, 1),
            monthly_rent=Decimal('10000.00'), status='active',
        )

    def concurrent_post(self, barrier, payload):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(user=self.user)
            barrier.wait(timeout=20)
            response = client.post('/api/v1/payments/', payload, format='json')
            return response.status_code, response.data
        finally:
            close_old_connections()

    def test_concurrent_payments_cannot_overallocate_same_charge(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.rooms[0], month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), paid_amount=Decimal('0.00'), status='unpaid',
        )
        barrier = Barrier(2)
        payloads = [
            {'roomId': self.rooms[0].id, 'chargeId': charge.id, 'amount': '6000.00',
             'method': 'cash', 'reference': f'pg-race-{i}', 'paymentDate': '2026-01-10'}
            for i in (1, 2)
        ]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda p: self.concurrent_post(barrier, p), payloads))

        self.assertCountEqual([code for code, _ in results], [201, 400])
        charge.refresh_from_db()
        from django.db.models import Sum
        allocated = PaymentAllocation.objects.filter(charge=charge).aggregate(total=Sum('amount'))['total']
        # One KES 6,000 request succeeds. The other observes only KES 4,000
        # remaining after the row lock is released and is rejected as overpayment.
        self.assertEqual(charge.paid_amount, Decimal('6000.00'))
        self.assertEqual(allocated, charge.paid_amount)
        self.assertEqual(Payment.objects.filter(reference__startswith='pg-race-').count(), 1)

    def test_concurrent_duplicate_transaction_reference_creates_one_payment(self):
        charge = RentCharge.objects.create(
            tenancy=self.tenancy, room=self.rooms[0], month='2026-01', due_date=date(2026, 1, 5),
            amount=Decimal('10000.00'), status='unpaid',
        )
        barrier = Barrier(2)
        original_validate_reference = RecordPaymentSerializer.validate_reference

        def synchronize_after_duplicate_check(serializer, value):
            normalized = original_validate_reference(serializer, value)
            barrier.wait(timeout=20)
            return normalized

        payload = {
            'roomId': self.rooms[0].id, 'chargeId': charge.id, 'amount': '1000.00',
            'method': 'cash', 'reference': 'pg-duplicate-reference', 'paymentDate': '2026-01-10',
        }
        with patch.object(RecordPaymentSerializer, 'validate_reference', synchronize_after_duplicate_check):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: self.concurrent_post(barrier, payload), range(2)))

        self.assertCountEqual([code for code, _ in results], [201, 400])
        self.assertEqual(Payment.objects.filter(reference='pg-duplicate-reference').count(), 1)
        self.assertEqual(PaymentAllocation.objects.filter(payment__reference='pg-duplicate-reference').count(), 1)

    def test_concurrent_receipts_on_different_rooms_are_unique(self):
        other_tenant = Tenant.objects.create(full_name='Second Tenant', phone='+254700000002')
        other_tenancy = Tenancy.objects.create(
            tenant=other_tenant, room=self.rooms[1], start_date=date(2026, 1, 1),
            monthly_rent=Decimal('10000.00'), status='active',
        )
        tenancies = (self.tenancy, other_tenancy)
        charges = [
            RentCharge.objects.create(
                tenancy=t, room=t.room, month='2026-01', due_date=date(2026, 1, 5),
                amount=Decimal('10000.00'), status='unpaid',
            ) for t in tenancies
        ]
        barrier = Barrier(2)
        payloads = [
            {'roomId': t.room_id, 'chargeId': charge.id, 'amount': '100.00', 'method': 'cash',
             'reference': f'pg-receipt-race-{i}', 'paymentDate': '2026-01-10'}
            for i, (t, charge) in enumerate(zip(tenancies, charges), 1)
        ]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda p: self.concurrent_post(barrier, p), payloads))

        self.assertEqual([code for code, _ in results], [201, 201])
        receipt_numbers = [data['receiptNumber'] for _, data in results]
        self.assertEqual(len(set(receipt_numbers)), 2)
        self.assertEqual(Payment.objects.filter(receipt_number__in=receipt_numbers).count(), 2)

    def test_concurrent_registration_cannot_create_two_active_tenancies(self):
        barrier = Barrier(2)

        def register(room):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=self.user)
                barrier.wait(timeout=20)
                response = client.post('/api/v1/tenancies/register/', {
                    'fullName': 'Concurrent Applicant', 'phone': '+254700009999',
                    'roomId': room.id, 'moveInDate': '2026-02-01', 'monthlyRent': '9000.00',
                }, format='json')
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(register, self.rooms[2:4]))

        self.assertCountEqual(results, [201, 400])
        self.assertEqual(Tenancy.objects.filter(tenant__phone='+254700009999', status='active').count(), 1)
        self.assertEqual(Tenant.objects.filter(phone='+254700009999').count(), 1)

    def test_concurrent_registrations_cannot_occupy_same_room_twice(self):
        barrier = Barrier(2)

        def register(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=self.user)
                barrier.wait(timeout=20)
                response = client.post('/api/v1/tenancies/register/', {
                    'fullName': f'Concurrent Room Applicant {index}', 'phone': f'+25470000800{index}',
                    'roomId': self.rooms[2].id, 'moveInDate': '2026-02-01', 'monthlyRent': '9000.00',
                }, format='json')
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(register, (1, 2)))

        self.assertCountEqual(results, [201, 400])
        active = Tenancy.objects.filter(room=self.rooms[2], status='active')
        self.rooms[2].refresh_from_db()
        self.assertEqual(active.count(), 1)
        self.assertEqual(self.rooms[2].status, 'occupied')

    def test_concurrent_deposit_settlement_cannot_refund_twice(self):
        deposit = Deposit.objects.create(
            tenancy=self.tenancy, tenant=self.tenant, amount=Decimal('10000.00'),
            received_date=date(2026, 1, 1), status='held',
        )
        barrier = Barrier(2)

        def settle(reference):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=self.user)
                barrier.wait(timeout=20)
                response = client.post(f'/api/v1/deposits/{deposit.id}/settle/', {
                    'refundAmount': '10000.00', 'refundMethod': 'cash',
                    'refundReference': reference,
                }, format='json')
                return response.status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(settle, ('pg-refund-race-1', 'pg-refund-race-2')))

        self.assertCountEqual(results, [200, 400])
        deposit.refresh_from_db()
        self.assertEqual(deposit.refund_amount, Decimal('10000.00'))
        self.assertEqual(deposit.status, 'refunded')
        self.assertEqual(deposit.deductions.count(), 0)

    def test_concurrent_rent_generation_creates_one_charge_per_tenancy_month(self):
        barrier = Barrier(2)

        def generate(_):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=self.user)
                barrier.wait(timeout=20)
                response = client.post('/api/v1/rent-charges/generate/', {'month': '2026-01'}, format='json')
                return response.status_code, response.data
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(generate, range(2)))

        self.assertEqual([code for code, _ in results], [200, 200])
        self.assertEqual(sum(data['createdCount'] for _, data in results), 1)
        self.assertEqual(RentCharge.objects.filter(tenancy=self.tenancy, month='2026-01').count(), 1)
