from decimal import Decimal
from rest_framework import serializers
from .models import Property, PropertySettings, Room


class PropertySettingsSerializer(serializers.ModelSerializer):
    roomRents = serializers.SerializerMethodField()

    class Meta:
        model = PropertySettings
        fields = [
            'id',
            'landlord_name',
            'landlord_initials',
            'landlord_phone',
            'landlord_email',
            'default_due_day',
            'auto_generate_charges',
            'roomRents',
            'created_at',
            'updated_at',
        ]

    def get_roomRents(self, obj):
        # Return dict mapping room number -> default_rent
        return {room.number: float(room.default_rent) for room in obj.property.rooms.all()}


class PropertySerializer(serializers.ModelSerializer):
    settings = PropertySettingsSerializer(read_only=True)

    class Meta:
        model = Property
        fields = ['id', 'name', 'location', 'currency', 'settings', 'created_at', 'updated_at']


class PropertySettingsUpdateSerializer(serializers.Serializer):
    propertyName = serializers.CharField(max_length=100, required=False)
    location = serializers.CharField(max_length=200, required=False)
    currency = serializers.CharField(max_length=10, required=False)
    landlordName = serializers.CharField(max_length=100, required=False)
    landlordInitials = serializers.CharField(max_length=10, required=False)
    landlordPhone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    landlordEmail = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    defaultDueDay = serializers.IntegerField(min_value=1, max_value=28, required=False)
    autoGenerateCharges = serializers.BooleanField(required=False)
    roomRents = serializers.DictField(
        child=serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01')),
        required=False,
    )


class RoomSerializer(serializers.ModelSerializer):
    defaultRent = serializers.DecimalField(source='default_rent', max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    currentTenancyId = serializers.SerializerMethodField()
    currentTenancy = serializers.SerializerMethodField()

    def validate(self, attrs):
        status_val = attrs.get('status')
        if status_val == 'vacant' and self.instance:
            if self.instance.tenancies.filter(status='active').exists():
                raise serializers.ValidationError({"status": "Cannot mark room as vacant while an active tenancy exists. Move out the tenant first."})
        return attrs

    class Meta:
        model = Room
        fields = [
            'id',
            'number',
            'name',
            'default_rent',
            'defaultRent',
            'status',
            'currentTenancyId',
            'currentTenancy',
            'created_at',
            'updated_at',
        ]

    def get_currentTenancyId(self, obj):
        active_tenancy = obj.get_current_tenancy()
        return str(active_tenancy.id) if active_tenancy else None

    def get_currentTenancy(self, obj):
        active_tenancy = obj.get_current_tenancy()
        if not active_tenancy:
            return None
        return {
            'id': active_tenancy.id,
            'tenantId': active_tenancy.tenant.id,
            'tenantName': active_tenancy.tenant.full_name,
            'tenantInitials': active_tenancy.tenant.initials,
            'startDate': str(active_tenancy.start_date),
            'monthlyRent': float(active_tenancy.monthly_rent),
            'deposit': float(active_tenancy.deposit),
            'rentDueDay': active_tenancy.rent_due_day,
            'status': active_tenancy.status,
        }
