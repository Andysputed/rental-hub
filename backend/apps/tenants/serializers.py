from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from apps.properties.models import Room
from apps.payments.models import Deposit
from .models import Tenant, Tenancy


class TenantSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source='full_name')
    activeRoom = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id',
            'full_name',
            'fullName',
            'phone',
            'email',
            'initials',
            'status',
            'activeRoom',
            'created_at',
            'updated_at',
        ]

    def get_activeRoom(self, obj):
        active_tenancy = obj.tenancies.filter(status='active').select_related('room').first()
        if active_tenancy and active_tenancy.room:
            return {
                'id': active_tenancy.room.id,
                'name': active_tenancy.room.name,
                'number': active_tenancy.room.number,
                'monthlyRent': float(active_tenancy.monthly_rent),
            }
        return None


class TenancySerializer(serializers.ModelSerializer):
    roomId = serializers.PrimaryKeyRelatedField(source='room', read_only=True)
    tenantId = serializers.PrimaryKeyRelatedField(source='tenant', read_only=True)
    tenantName = serializers.CharField(source='tenant.full_name', read_only=True)
    roomName = serializers.CharField(source='room.name', read_only=True)
    startDate = serializers.DateField(source='start_date')
    endDate = serializers.DateField(source='end_date', allow_null=True, required=False)
    monthlyRent = serializers.DecimalField(source='monthly_rent', max_digits=12, decimal_places=2)
    rentDueDay = serializers.IntegerField(source='rent_due_day')

    class Meta:
        model = Tenancy
        fields = [
            'id',
            'roomId',
            'tenantId',
            'tenantName',
            'roomName',
            'startDate',
            'endDate',
            'monthlyRent',
            'deposit',
            'rentDueDay',
            'status',
            'created_at',
            'updated_at',
        ]


class TenantRegistrationSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=30)
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    roomId = serializers.IntegerField()
    moveInDate = serializers.DateField()
    monthlyRent = serializers.DecimalField(max_digits=12, decimal_places=2)
    deposit = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), required=False)
    rentDueDay = serializers.IntegerField(default=5, required=False)

    def validate_roomId(self, value):
        try:
            room = Room.objects.get(id=value)
        except Room.DoesNotExist:
            raise serializers.ValidationError("Selected room does not exist.")

        if room.status == 'occupied' or room.tenancies.filter(status='active').exists():
            raise serializers.ValidationError(f"{room.name} is already occupied by an active tenancy.")
        return value

    def create(self, validated_data):
        room_id = validated_data['roomId']
        full_name = validated_data['fullName']
        phone = validated_data['phone']
        email = validated_data.get('email', '')
        move_in_date = validated_data['moveInDate']
        monthly_rent = validated_data['monthlyRent']
        deposit_amount = validated_data.get('deposit', Decimal('0.00'))
        rent_due_day = validated_data.get('rentDueDay', 5)

        with transaction.atomic():
            room = Room.objects.select_for_update().get(id=room_id)
            if room.status == 'occupied' or room.tenancies.filter(status='active').exists():
                raise serializers.ValidationError({"roomId": f"{room.name} is already occupied."})

            # Create or update tenant record
            tenant, _ = Tenant.objects.get_or_create(
                phone=phone,
                defaults={
                    'full_name': full_name,
                    'email': email or None,
                    'status': 'active',
                }
            )
            # If tenant existed, ensure full_name and status are updated
            tenant.full_name = full_name
            if email:
                tenant.email = email
            tenant.status = 'active'
            tenant.save()

            # Create active tenancy
            tenancy = Tenancy.objects.create(
                tenant=tenant,
                room=room,
                start_date=move_in_date,
                monthly_rent=monthly_rent,
                deposit=deposit_amount,
                rent_due_day=rent_due_day,
                status='active',
            )

            # Update room occupancy
            room.status = 'occupied'
            room.save()

            # If deposit recorded, store in separate Deposit ledger
            if deposit_amount > Decimal('0.00'):
                Deposit.objects.create(
                    tenancy=tenancy,
                    tenant=tenant,
                    amount=deposit_amount,
                    received_date=move_in_date,
                    status='held',
                    reference=f"DEP-{tenancy.id}-{room.number}",
                    notes=f"Initial security deposit for {room.name}"
                )

        return tenancy


class MoveOutSerializer(serializers.Serializer):
    endDate = serializers.DateField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_endDate(self, value):
        tenancy = getattr(self, 'instance', None)
        if tenancy and value < tenancy.start_date:
            raise serializers.ValidationError(f"Move-out date cannot be before move-in date ({tenancy.start_date}).")
        return value

    def update(self, tenancy, validated_data):
        with transaction.atomic():
            end_date = validated_data['endDate']
            tenancy.end_date = end_date
            tenancy.status = 'ended'
            tenancy.save()

            # Check if tenant has any other active tenancies
            tenant = tenancy.tenant
            if not tenant.tenancies.filter(status='active').exclude(id=tenancy.id).exists():
                tenant.status = 'former'
                tenant.save()

            # Mark room vacant
            room = tenancy.room
            room.status = 'vacant'
            room.save()

            notes = validated_data.get('notes', '').strip()
            if notes:
                deposit = tenancy.deposits.filter(status='held').first()
                if deposit:
                    existing = deposit.notes
                    deposit.notes = f"{existing}\nMove-out notes: {notes}".strip()
                    deposit.save()

        return tenancy
