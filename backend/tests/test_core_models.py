from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.db import IntegrityError
from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.rent.models import RentCharge
from apps.payments.models import Payment, PaymentAllocation, Deposit
from apps.expenses.models import Expense


class CoreModelsTestCase(TestCase):
    def setUp(self):
        self.property = Property.objects.create(
            name="Acacia House",
            location="Nairobi",
            currency="KES"
        )
        self.settings = PropertySettings.objects.create(
            property=self.property,
            landlord_name="James M.",
            landlord_initials="JM",
            default_due_day=5,
            auto_generate_charges=True
        )
        self.room1 = Room.objects.create(
            property=self.property,
            number="01",
            name="Room 01",
            default_rent=Decimal("10000.00"),
            status="vacant"
        )
        self.tenant1 = Tenant.objects.create(
            full_name="Amina Hassan",
            phone="+254 7XX XXX 101",
            email="amina@example.com"
        )

    def test_property_and_settings_creation(self):
        self.assertEqual(self.property.name, "Acacia House")
        self.assertEqual(self.property.settings.landlord_name, "James M.")
        self.assertEqual(self.property.settings.default_due_day, 5)

    def test_room_unique_number_per_property(self):
        """Room numbers must be unique within a property."""
        with self.assertRaises(IntegrityError):
            Room.objects.create(
                property=self.property,
                number="01",  # Duplicate number
                name="Room 01 Duplicate",
                default_rent=Decimal("10000.00")
            )

    def test_tenant_initials_auto_generation(self):
        """Tenant initials are automatically generated if not supplied."""
        self.assertEqual(self.tenant1.initials, "AH")

        single_name_tenant = Tenant.objects.create(
            full_name="Faith",
            phone="+254 7XX XXX 999"
        )
        self.assertEqual(single_name_tenant.initials, "FA")

    def test_prevent_overlapping_active_tenancies_for_same_room(self):
        """Cannot have two active tenancies for the same room."""
        Tenancy.objects.create(
            tenant=self.tenant1,
            room=self.room1,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )

        tenant2 = Tenant.objects.create(
            full_name="Brian Otieno",
            phone="+254 7XX XXX 102"
        )

        with self.assertRaises(IntegrityError):
            Tenancy.objects.create(
                tenant=tenant2,
                room=self.room1,  # Same room
                start_date=date(2026, 10, 1),
                monthly_rent=Decimal("10000.00"),
                status="active"
            )

    def test_allow_ended_tenancy_and_new_active_tenancy(self):
        """An ended historical tenancy does not block a new active tenancy for the same room."""
        Tenancy.objects.create(
            tenant=self.tenant1,
            room=self.room1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 9, 30),
            monthly_rent=Decimal("10000.00"),
            status="ended"
        )

        tenant2 = Tenant.objects.create(
            full_name="Brian Otieno",
            phone="+254 7XX XXX 102"
        )
        new_active = Tenancy.objects.create(
            tenant=tenant2,
            room=self.room1,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )
        self.assertIsNotNone(new_active.id)

    def test_prevent_duplicate_rent_charges(self):
        """Cannot generate duplicate rent charges for the same tenancy and billing month."""
        tenancy = Tenancy.objects.create(
            tenant=self.tenant1,
            room=self.room1,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )

        RentCharge.objects.create(
            tenancy=tenancy,
            room=self.room1,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00")
        )

        with self.assertRaises(IntegrityError):
            RentCharge.objects.create(
                tenancy=tenancy,
                room=self.room1,
                month="2026-10",  # Duplicate month
                due_date=date(2026, 10, 5),
                amount=Decimal("10000.00")
            )

    def test_payment_and_allocation_decimal_precision(self):
        """Financial operations maintain exact decimal precision."""
        tenancy = Tenancy.objects.create(
            tenant=self.tenant1,
            room=self.room1,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )
        charge = RentCharge.objects.create(
            tenancy=tenancy,
            room=self.room1,
            month="2026-10",
            due_date=date(2026, 10, 5),
            amount=Decimal("10000.00")
        )

        payment = Payment.objects.create(
            tenant=self.tenant1,
            tenancy=tenancy,
            room=self.room1,
            charge=charge,
            receipt_number="RH-2026-001",
            amount=Decimal("7500.50"),
            date=date(2026, 10, 4),
            method="mpesa",
            reference="UJ4R8K2M6P"
        )
        allocation = PaymentAllocation.objects.create(
            payment=payment,
            charge=charge,
            amount=Decimal("7500.50")
        )
        self.assertEqual(allocation.amount, Decimal("7500.50"))

    def test_deposit_is_separate_from_rent(self):
        """Deposits are stored separately from rent charges and payments."""
        tenancy = Tenancy.objects.create(
            tenant=self.tenant1,
            room=self.room1,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            deposit=Decimal("10000.00"),
            status="active"
        )
        deposit = Deposit.objects.create(
            tenancy=tenancy,
            tenant=self.tenant1,
            amount=Decimal("10000.00"),
            received_date=date(2026, 10, 1),
            status="held",
            reference="DEP-011026"
        )
        self.assertEqual(deposit.amount, Decimal("10000.00"))
        self.assertEqual(deposit.status, "held")

    def test_expense_creation_and_categorization(self):
        """Property expenses are properly categorized."""
        expense = Expense.objects.create(
            property=self.property,
            category="cleaning",
            title="Compound cleaning",
            amount=Decimal("1500.00"),
            date=date(2026, 10, 15),
            method="cash"
        )
        self.assertEqual(expense.category, "cleaning")
        self.assertEqual(expense.amount, Decimal("1500.00"))
