from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.properties.models import Property, PropertySettings, Room
from apps.tenants.models import Tenant, Tenancy
from apps.payments.models import Deposit


class CoreAPIsTestCase(TestCase):
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
        self.rooms = []
        for i in range(1, 7):
            num = f"{i:02d}"
            r = Room.objects.create(
                property=self.property,
                number=num,
                name=f"Room {num}",
                default_rent=Decimal("10000.00"),
                status="vacant"
            )
            self.rooms.append(r)

    def test_list_rooms_and_filter_by_status(self):
        """Room register returns all 6 rooms and supports status filtering."""
        response = self.client.get('/api/v1/rooms/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 6)

        # Mark Room 01 occupied
        tenant = Tenant.objects.create(full_name="Amina Hassan", phone="+254 7XX XXX 101")
        Tenancy.objects.create(
            tenant=tenant,
            room=self.rooms[0],
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )
        self.rooms[0].status = 'occupied'
        self.rooms[0].save()

        # Test filter ?status=occupied
        resp_occ = self.client.get('/api/v1/rooms/?status=occupied')
        self.assertEqual(resp_occ.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_occ.data['results']), 1)
        self.assertEqual(resp_occ.data['results'][0]['number'], '01')
        self.assertEqual(resp_occ.data['results'][0]['currentTenancy']['tenantName'], 'Amina Hassan')

        # Test filter ?status=vacant
        resp_vac = self.client.get('/api/v1/rooms/?status=vacant')
        self.assertEqual(resp_vac.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_vac.data['results']), 5)

    def test_get_and_patch_settings(self):
        """Settings endpoint returns defaults and allows authorized partial updates."""
        get_res = self.client.get('/api/v1/settings/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['propertyName'], 'Acacia House')
        self.assertEqual(get_res.data['defaultDueDay'], 5)

        patch_res = self.client.patch('/api/v1/settings/', {
            'defaultDueDay': 10,
            'landlordName': 'Veronicah Kaptingei',
            'roomRents': {'01': 11000}
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['defaultDueDay'], 10)
        self.assertEqual(patch_res.data['landlordName'], 'Veronicah Kaptingei')

        # Verify Room 01 rent updated
        r1 = Room.objects.get(property=self.property, number='01')
        self.assertEqual(r1.default_rent, Decimal('11000.00'))

    def test_tenant_registration_and_atomic_room_assignment(self):
        """Atomic registration registers tenant, creates active tenancy, and updates room status."""
        vacant_room = self.rooms[0]
        payload = {
            'fullName': 'Brian Otieno',
            'phone': '+254 712 345 678',
            'email': 'brian@example.com',
            'roomId': vacant_room.id,
            'moveInDate': '2026-10-01',
            'monthlyRent': '10000.00',
            'deposit': '10000.00',
            'rentDueDay': 5
        }
        response = self.client.post('/api/v1/tenancies/register/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['tenantName'], 'Brian Otieno')
        self.assertEqual(response.data['status'], 'active')

        # Verify room status changed to occupied
        vacant_room.refresh_from_db()
        self.assertEqual(vacant_room.status, 'occupied')

        # Verify deposit created in separate Deposit ledger
        deposit = Deposit.objects.filter(tenancy_id=response.data['id']).first()
        self.assertIsNotNone(deposit)
        self.assertEqual(deposit.amount, Decimal('10000.00'))
        self.assertEqual(deposit.status, 'held')

    def test_prevent_registration_for_already_occupied_room(self):
        """Cannot register a tenant into a room that is already occupied."""
        room = self.rooms[1]
        tenant1 = Tenant.objects.create(full_name="Faith Wanjiku", phone="+254 700 111 222")
        Tenancy.objects.create(
            tenant=tenant1,
            room=room,
            start_date=date(2026, 10, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )
        room.status = 'occupied'
        room.save()

        conflict_payload = {
            'fullName': 'David Mwangi',
            'phone': '+254 722 333 444',
            'roomId': room.id,
            'moveInDate': '2026-10-05',
            'monthlyRent': '10000.00'
        }
        response = self.client.post('/api/v1/tenancies/register/', conflict_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('roomId', response.data)

    def test_tenant_move_out_preserves_history(self):
        """Moving out marks tenancy as ended and room as vacant, without losing records."""
        room = self.rooms[2]
        tenant = Tenant.objects.create(full_name="Esther Achieng", phone="+254 733 444 555")
        tenancy = Tenancy.objects.create(
            tenant=tenant,
            room=room,
            start_date=date(2026, 1, 1),
            monthly_rent=Decimal("10000.00"),
            status="active"
        )
        room.status = 'occupied'
        room.save()

        # Execute move-out
        move_out_res = self.client.post(f'/api/v1/tenancies/{tenancy.id}/move-out/', {
            'endDate': '2026-10-15',
            'notes': 'Tenant relocated'
        }, format='json')

        self.assertEqual(move_out_res.status_code, status.HTTP_200_OK)
        self.assertEqual(move_out_res.data['status'], 'ended')

        # Verify room is now vacant
        room.refresh_from_db()
        self.assertEqual(room.status, 'vacant')

        # Verify tenant record is preserved and status set to former
        tenant.refresh_from_db()
        self.assertEqual(tenant.status, 'former')
        self.assertEqual(tenant.tenancies.count(), 1)
