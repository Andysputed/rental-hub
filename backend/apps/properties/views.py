from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db import transaction
from .models import Property, PropertySettings, Room
from .serializers import PropertySerializer, PropertySettingsSerializer, RoomSerializer


def get_or_create_default_property():
    """Ensure a default Property with 6 rooms and settings exists."""
    prop, _ = Property.objects.get_or_create(
        id=1,
        defaults={
            'name': 'Acacia House',
            'location': 'Nairobi · 6 rooms',
            'currency': 'KES',
        }
    )
    PropertySettings.objects.get_or_create(
        property=prop,
        defaults={
            'landlord_name': 'Veronicah K.',
            'landlord_initials': 'VK',
            'default_due_day': 5,
            'auto_generate_charges': True,
        }
    )
    # Ensure standard 6 rooms exist
    for i in range(1, 7):
        num_str = f"{i:02d}"
        Room.objects.get_or_create(
            property=prop,
            number=num_str,
            defaults={
                'name': f"Room {num_str}",
                'default_rent': Decimal('10000.00'),
                'status': 'vacant',
            }
        )
    return prop


class RoomViewSet(viewsets.ModelViewSet):
    serializer_class = RoomSerializer

    def get_queryset(self):
        get_or_create_default_property()
        qs = Room.objects.all().select_related('property').prefetch_related('tenancies__tenant')
        status_param = self.request.query_params.get('status')
        if status_param in ('occupied', 'vacant'):
            qs = qs.filter(status=status_param)
        return qs.order_by('number')


class PropertySettingsView(APIView):
    def get(self, request):
        prop = get_or_create_default_property()
        settings = prop.settings
        serializer = PropertySettingsSerializer(settings)
        data = serializer.data
        data['propertyName'] = prop.name
        data['location'] = prop.location
        data['currency'] = prop.currency
        data['landlordName'] = settings.landlord_name
        data['landlordInitials'] = settings.landlord_initials
        data['landlordPhone'] = settings.landlord_phone
        data['landlordEmail'] = settings.landlord_email
        data['defaultDueDay'] = settings.default_due_day
        data['autoGenerateCharges'] = settings.auto_generate_charges
        return Response(data)

    def patch(self, request):
        prop = get_or_create_default_property()
        settings = prop.settings

        with transaction.atomic():
            if 'propertyName' in request.data:
                prop.name = request.data['propertyName']
            if 'location' in request.data:
                prop.location = request.data['location']
            if 'currency' in request.data:
                prop.currency = request.data['currency']
            prop.save()

            if 'landlordName' in request.data:
                settings.landlord_name = request.data['landlordName']
            if 'landlordInitials' in request.data:
                settings.landlord_initials = request.data['landlordInitials']
            if 'landlordPhone' in request.data:
                settings.landlord_phone = request.data['landlordPhone']
            if 'landlordEmail' in request.data:
                settings.landlord_email = request.data['landlordEmail']
            if 'defaultDueDay' in request.data:
                settings.default_due_day = int(request.data['defaultDueDay'])
            if 'autoGenerateCharges' in request.data:
                settings.auto_generate_charges = bool(request.data['autoGenerateCharges'])
            settings.save()

            # Update individual room default rents if roomRents provided: {"01": 10000, ...}
            room_rents = request.data.get('roomRents', {})
            if isinstance(room_rents, dict):
                for room_num, rent_val in room_rents.items():
                    Room.objects.filter(property=prop, number=str(room_num).zfill(2)).update(
                        default_rent=Decimal(str(rent_val))
                    )

        serializer = PropertySettingsSerializer(settings)
        data = serializer.data
        data['propertyName'] = prop.name
        data['location'] = prop.location
        data['currency'] = prop.currency
        data['landlordName'] = settings.landlord_name
        data['landlordInitials'] = settings.landlord_initials
        data['landlordPhone'] = settings.landlord_phone
        data['landlordEmail'] = settings.landlord_email
        data['defaultDueDay'] = settings.default_due_day
        data['autoGenerateCharges'] = settings.auto_generate_charges
        return Response(data, status=status.HTTP_200_OK)
