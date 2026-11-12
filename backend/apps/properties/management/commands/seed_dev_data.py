from decimal import Decimal
from datetime import date
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from apps.payments.models import Payment, PaymentAllocation, Deposit
from apps.expenses.models import Expense


class Command(BaseCommand):
    help = "Seed development data matching Kimumu Rentals 6-room property wireframes"

    def handle(self, *args, **options):
        with transaction.atomic():
            self.stdout.write("Seeding development data for Kimumu Rentals...")

            # 1. Property
            prop, _ = Property.objects.get_or_create(
                id=1,
                defaults={
                    'name': 'Kimumu Rentals',
                    'location': 'Kimumu, Eldoret, Kenya',
                    'currency': 'KES',
                }
            )

            # 2. Settings
            PropertySettings.objects.get_or_create(
                property=prop,
                defaults={
                    'landlord_name': 'Veronicah K.',
                    'landlord_initials': 'VK',
                    'default_due_day': 5,
                    'auto_generate_charges': True,
                }
            )

            # 3. Six Rooms
            rooms_dict = {}
            for i in range(1, 7):
                num = f"{i:02d}"
                room, _ = Room.objects.get_or_create(
                    property=prop,
                    number=num,
                    defaults={
                        'name': f"Room {num}",
                        'default_rent': Decimal('10000.00'),
                        'status': 'occupied' if i < 6 else 'vacant',
                    }
                )
                rooms_dict[num] = room

            # 4. Five Tenants & Tenancies
            sample_tenants = [
                ('01', 'Amina Hassan', '+254 7XX XXX 101', 'amina@example.com', 'AH'),
                ('02', 'Brian Otieno', '+254 7XX XXX 102', 'brian@example.com', 'BO'),
                ('03', 'Faith Wanjiku', '+254 7XX XXX 103', 'faith@example.com', 'FW'),
                ('04', 'David Mwangi', '+254 7XX XXX 104', 'david@example.com', 'DM'),
                ('05', 'Esther Achieng', '+254 7XX XXX 105', 'esther@example.com', 'EA'),
            ]

            tenancies_dict = {}
            for room_num, full_name, phone, email, initials in sample_tenants:
                tenant, _ = Tenant.objects.get_or_create(
                    phone=phone,
                    defaults={
                        'full_name': full_name,
                        'email': email,
                        'initials': initials,
                        'status': 'active',
                    }
                )
                room = rooms_dict[room_num]
                room.status = 'occupied'
                room.save()

                tenancy, _ = Tenancy.objects.get_or_create(
                    tenant=tenant,
                    room=room,
                    status='active',
                    defaults={
                        'start_date': date(2026, 10, 1),
                        'monthly_rent': Decimal('10000.00'),
                        'deposit': Decimal('10000.00'),
                        'rent_due_day': 5,
                    }
                )
                tenancies_dict[room_num] = tenancy

                # Create deposit record if not exists
                Deposit.objects.get_or_create(
                    tenancy=tenancy,
                    tenant=tenant,
                    defaults={
                        'amount': Decimal('10000.00'),
                        'received_date': date(2026, 10, 1),
                        'status': 'held',
                        'reference': f"DEP-{tenancy.id}-{room_num}",
                        'notes': f"Initial security deposit for {room.name}"
                    }
                )

            # 5. October 2026 Rent Charges
            charges_dict = {}
            for room_num, tenancy in tenancies_dict.items():
                charge, _ = RentCharge.objects.get_or_create(
                    tenancy=tenancy,
                    month='2026-10',
                    defaults={
                        'room': tenancy.room,
                        'due_date': date(2026, 10, 5),
                        'amount': Decimal('10000.00'),
                        'paid_amount': Decimal('0.00'),
                        'status': 'unpaid',
                    }
                )
                charges_dict[room_num] = charge

            # 6. Historical Payments
            sample_payments = [
                ('01', 'RH-2026-001', Decimal('10000.00'), date(2026, 10, 2), 'mpesa', 'UJ2A6H9N3K'),
                ('02', 'RH-2026-002', Decimal('10000.00'), date(2026, 10, 3), 'bank', 'BNK-031026-02'),
                ('03', 'RH-2026-003', Decimal('7500.00'), date(2026, 10, 4), 'mpesa', 'UJ4R8K2M6P'),
                ('04', 'RH-2026-004', Decimal('6000.00'), date(2026, 10, 8), 'cash', 'CASH-081026-04'),
                ('05', 'RH-2026-005', Decimal('5000.00'), date(2026, 10, 12), 'mpesa', 'UJC5E7T2Q9'),
            ]

            for room_num, receipt_no, amt, pay_date, method, ref in sample_payments:
                tenancy = tenancies_dict[room_num]
                charge = charges_dict[room_num]
                payment, created = Payment.objects.get_or_create(
                    reference=ref,
                    defaults={
                        'receipt_number': receipt_no,
                        'tenant': tenancy.tenant,
                        'tenancy': tenancy,
                        'room': tenancy.room,
                        'charge': charge,
                        'amount': amt,
                        'date': pay_date,
                        'method': method,
                    }
                )
                if created:
                    PaymentAllocation.objects.get_or_create(
                        payment=payment,
                        charge=charge,
                        defaults={'amount': amt}
                    )
                    charge.paid_amount += amt
                    charge.update_status()
                    charge.save()

            # 7. Property Expenses
            sample_expenses = [
                ('cleaning', 'Compound cleaning', Decimal('1500.00'), date(2026, 10, 15), 'cash', 'Cleaner weekly stipend'),
                ('maintenance', 'Tap repair in shared courtyard', Decimal('4500.00'), date(2026, 10, 10), 'mpesa', 'Plumber replacement brass tap'),
                ('utilities', 'Security light replacement', Decimal('2500.00'), date(2026, 10, 8), 'cash', 'External solar floodlight maintenance'),
            ]

            for cat, title, amt, exp_date, method, desc in sample_expenses:
                Expense.objects.get_or_create(
                    property=prop,
                    title=title,
                    date=exp_date,
                    defaults={
                        'category': cat,
                        'amount': amt,
                        'method': method,
                        'description': desc,
                    }
                )

            self.stdout.write(self.style.SUCCESS("Successfully seeded development data for Kimumu Rentals!"))
