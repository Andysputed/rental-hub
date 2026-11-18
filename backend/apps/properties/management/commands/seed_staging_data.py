"""Build the isolated staging dataset through the app's real business logic."""

import os
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.expenses.models import Expense
from apps.payments.serializers import RecordPaymentSerializer
from apps.properties.models import Property, PropertySettings, Room
from apps.properties.staging_data import wipe_staging_data
from apps.rent.services import generate_monthly_charges
from apps.tenants.serializers import TenantRegistrationSerializer
from config.staging_guard import assert_staging

PROPERTY_ID = 1
MONTHS = ('2026-07', '2026-08', '2026-09', '2026-10', '2026-11')

ROOMS = (
    ('01', '12000.00'),
    ('02', '13500.00'),
    ('03', '11000.00'),
    ('04', '14500.00'),
    ('05', '12500.00'),
    ('06', '10000.00'),
)

TENANTS = (
    {
        'fullName': 'Amina Njoki',
        'phone': '+254 700 000 101',
        'email': 'amina.njoki@example.invalid',
        'roomNumber': '01',
        'moveInDate': '2026-09-01',
        'monthlyRent': '12000.00',
        'depositRequired': '12000.00',
        'depositPaid': '12000.00',
        'depositMethod': 'mpesa',
        'depositReference': 'STG-DEP-101',
        'rentDueDay': 5,
    },
    {
        'fullName': 'Brian Ochieng',
        'phone': '+254 700 000 102',
        'email': 'brian.ochieng@example.invalid',
        'roomNumber': '02',
        'moveInDate': '2026-07-01',
        'monthlyRent': '13500.00',
        'depositRequired': '13500.00',
        'depositPaid': '10000.00',
        'depositMethod': 'bank',
        'depositReference': 'STG-DEP-102',
        'rentDueDay': 5,
    },
    {
        'fullName': 'Cynthia Wambui',
        'phone': '+254 700 000 103',
        'email': 'cynthia.wambui@example.invalid',
        'roomNumber': '03',
        'moveInDate': '2026-09-15',
        'monthlyRent': '11000.00',
        'depositRequired': '11000.00',
        'depositPaid': '5500.00',
        'depositMethod': 'mpesa',
        'depositReference': 'STG-DEP-103',
        'rentDueDay': 15,
    },
    {
        'fullName': 'Dennis Kiprop',
        'phone': '+254 700 000 104',
        'email': 'dennis.kiprop@example.invalid',
        'roomNumber': '04',
        'moveInDate': '2026-11-01',
        'monthlyRent': '14500.00',
        'depositRequired': '14500.00',
        'depositPaid': '14500.00',
        'depositMethod': 'mpesa',
        'depositReference': 'STG-DEP-104',
        'rentDueDay': 5,
    },
    {
        'fullName': 'Esther Muthoni',
        'phone': '+254 700 000 105',
        'email': 'esther.muthoni@example.invalid',
        'roomNumber': '05',
        'moveInDate': '2026-09-01',
        'monthlyRent': '12500.00',
        'depositRequired': '12500.00',
        'depositPaid': '3000.00',
        'depositMethod': 'cash',
        'depositReference': 'STG-DEP-105',
        'rentDueDay': 5,
    },
)

# Chronological receipts. The final 1,000 receipt overpays a settled tenancy and
# is expected to remain available advance credit.
PAYMENTS = (
    ('02', '13500.00', '2026-07-03', 'mpesa', 'STG-MP-0701', '2026-07'),
    ('02', '7000.00', '2026-08-04', 'bank', 'STG-BK-0801', '2026-08'),
    ('02', '6500.00', '2026-08-09', 'mpesa', 'STG-MP-0802', '2026-08'),
    ('05', '12500.00', '2026-09-02', 'mpesa', 'STG-MP-0904', '2026-09'),
    ('01', '12000.00', '2026-09-04', 'mpesa', 'STG-MP-0902', '2026-09'),
    ('02', '13500.00', '2026-09-10', 'cash', 'STG-CS-0901', '2026-09'),
    ('03', '5866.67', '2026-09-15', 'mpesa', 'STG-MP-0903', '2026-09'),
    ('02', '13500.00', '2026-10-03', 'bank', 'STG-BK-1001', '2026-10'),
    ('05', '12500.00', '2026-10-05', 'cash', 'STG-CS-1004', '2026-10'),
    ('01', '12000.00', '2026-10-06', 'bank', 'STG-BK-1002', '2026-10'),
    ('03', '10000.00', '2026-10-20', 'bank', 'STG-BK-1003', '2026-10'),
    ('05', '12500.00', '2026-11-04', 'bank', 'STG-BK-1104', '2026-11'),
    ('01', '11000.00', '2026-11-12', 'cash', 'STG-CS-1102', '2026-11'),
    ('05', '1000.00', '2026-11-12', 'mpesa', 'STG-MP-1105', '2026-11'),
)

EXPENSES = (
    ('maintenance', 'Replace corridor light fittings', '4500.00', '2026-07-12', 'cash', 'STG-EXP-01'),
    ('utilities', 'Water bill top-up (July)', '6000.00', '2026-07-28', 'bank', 'STG-EXP-02'),
    ('cleaning', 'Deep clean vacant Room 06', '3500.00', '2026-08-15', 'cash', 'STG-EXP-03'),
    ('maintenance', 'Repair main gate lock', '2650.00', '2026-09-09', 'mpesa', 'STG-EXP-04'),
    ('utilities', 'Electricity token purchase', '4000.00', '2026-10-11', 'mpesa', 'STG-EXP-05'),
    ('cleaning', 'Common area cleaning supplies', '5000.00', '2026-11-06', 'cash', 'STG-EXP-06'),
)


class Command(BaseCommand):
    help = 'Seed the isolated staging database with a fictional, reproducible dataset.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete existing staging business data before seeding.',
        )
        parser.add_argument(
            '--noinput',
            action='store_true',
            help='Accepted for non-interactive use; seeding never prompts.',
        )

    def handle(self, *args, **options):
        assert_staging('seed staging data')

        if options['reset']:
            counts = wipe_staging_data()
            self.stdout.write(
                'Cleared staging data: '
                + ', '.join(f'{name}={count}' for name, count in counts.items())
            )
        elif Room.objects.exists():
            raise CommandError(
                'Staging business data already exists. Re-run with --reset to rebuild it.'
            )

        with transaction.atomic():
            property_obj = self._create_property()
            self._create_landlord()
            rooms = self._create_rooms(property_obj)
            tenancies = self._create_tenancies(rooms)
            self._generate_charges(property_obj)
            self._record_payments(tenancies)
            self._create_expenses(property_obj)

        self.stdout.write(self.style.SUCCESS('Staging dataset seeded successfully.'))
        self.stdout.write(
            'Expected totals: rent charged 183366.67, rent received 143366.67, '
            'allocated 142366.67, outstanding 41000.00, advance credit 1000.00.'
        )

    def _create_property(self):
        property_obj, _ = Property.objects.update_or_create(
            pk=PROPERTY_ID,
            defaults={
                'name': 'Ridgeview Staging Apartments',
                'location': 'Stagingville, Nairobi, Kenya',
                'currency': 'KES',
            },
        )
        PropertySettings.objects.update_or_create(
            property=property_obj,
            defaults={
                'landlord_name': 'Staging Landlord',
                'landlord_initials': 'SL',
                'landlord_phone': '+254 700 000 100',
                'landlord_email': 'landlord@example.invalid',
                'default_due_day': 5,
                'auto_generate_charges': True,
            },
        )
        self.stdout.write(f'Property: {property_obj.name} (id={property_obj.id})')
        return property_obj

    def _create_landlord(self):
        username = os.getenv('STAGING_LANDLORD_USERNAME', 'staging_landlord')
        password = os.getenv('STAGING_LANDLORD_PASSWORD', '')
        if not password:
            raise CommandError(
                'STAGING_LANDLORD_PASSWORD is required to create the staging landlord account.'
            )

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={'email': 'landlord@example.invalid', 'is_staff': True, 'is_superuser': True},
        )
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(
            f'Landlord account: {username} ({"created" if created else "updated"})'
        )

    def _create_rooms(self, property_obj):
        rooms = {}
        for number, rent in ROOMS:
            room = Room.objects.create(
                property=property_obj,
                number=number,
                name=f'Room {number}',
                default_rent=Decimal(rent),
                status='vacant',
            )
            rooms[number] = room
        self.stdout.write(f'Rooms: {len(rooms)} created (occupancy follows tenancy registration)')
        return rooms

    def _create_tenancies(self, rooms):
        tenancies = {}
        for tenant_data in TENANTS:
            payload = {key: value for key, value in tenant_data.items() if key != 'roomNumber'}
            payload['roomId'] = rooms[tenant_data['roomNumber']].id
            serializer = TenantRegistrationSerializer(data=payload)
            if not serializer.is_valid():
                raise CommandError(
                    f"Could not register {tenant_data['fullName']}: {serializer.errors}"
                )
            tenancy = serializer.save()
            tenancies[tenant_data['roomNumber']] = tenancy
            self.stdout.write(
                f"Tenancy: {tenancy.tenant.full_name} -> {tenancy.room.name} "
                f"(rent {tenancy.monthly_rent}, starts {tenancy.start_date})"
            )
        return tenancies

    def _generate_charges(self, property_obj):
        grand_total = Decimal('0.00')
        for month in MONTHS:
            created, skipped, total = generate_monthly_charges(month=month, property_obj=property_obj)
            grand_total += total
            self.stdout.write(f'Charges {month}: created={created} skipped={skipped} total={total}')
        self.stdout.write(f'Charges generated: total={grand_total}')

    def _record_payments(self, tenancies):
        grand_total = Decimal('0.00')
        for room_number, amount, payment_date, method, reference, charge_month in PAYMENTS:
            tenancy = tenancies[room_number]
            serializer = RecordPaymentSerializer(data={
                'roomId': tenancy.room_id,
                'tenancyId': tenancy.id,
                'amount': amount,
                'method': method,
                'reference': reference,
                'paymentDate': payment_date,
                'chargeMonth': charge_month,
                'notes': 'Staging fixture payment',
            })
            if not serializer.is_valid():
                raise CommandError(f'Could not record payment {reference}: {serializer.errors}')
            payment = serializer.save()
            grand_total += payment.amount
            self.stdout.write(
                f'Payment: {payment.receipt_number} {payment.amount} '
                f'({method}) room {room_number} on {payment.date}'
            )
        self.stdout.write(f'Payments recorded: total={grand_total}')

    def _create_expenses(self, property_obj):
        grand_total = Decimal('0.00')
        for category, title, amount, expense_date, method, reference in EXPENSES:
            expense = Expense.objects.create(
                property=property_obj,
                category=category,
                title=title,
                amount=Decimal(amount),
                date=expense_date,
                method=method,
                reference=reference,
                description='Staging fixture expense',
            )
            grand_total += expense.amount
        self.stdout.write(f'Expenses created: total={grand_total}')
