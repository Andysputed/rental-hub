from rest_framework import mixins, viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db import transaction
from django.conf import settings as django_settings
from .models import Property, PropertySettings, Room
from .serializers import PropertySettingsSerializer, PropertySettingsUpdateSerializer, RoomSerializer
from .services import get_default_property, get_active_property_id


class RoomViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = RoomSerializer

    def get_queryset(self):
        qs = Room.objects.all().select_related('property').prefetch_related('tenancies__tenant')
        active_prop_id = get_active_property_id()
        if active_prop_id:
            qs = qs.filter(property_id=active_prop_id)
        status_param = self.request.query_params.get('status')
        if status_param in ('occupied', 'vacant'):
            qs = qs.filter(status=status_param)
        return qs.order_by('number')


class PropertySettingsView(APIView):
    @staticmethod
    def _response(prop, settings, response_status=status.HTTP_200_OK):
        data = PropertySettingsSerializer(settings).data
        data.update({
            'propertyName': prop.name,
            'location': prop.location,
            'currency': prop.currency,
            'landlordName': settings.landlord_name,
            'landlordInitials': settings.landlord_initials,
            'landlordPhone': settings.landlord_phone,
            'landlordEmail': settings.landlord_email,
            'defaultDueDay': settings.default_due_day,
            'autoGenerateCharges': settings.auto_generate_charges,
        })
        return Response(data, status=response_status)

    def get(self, request):
        prop = get_default_property()
        if not prop:
            return Response({"detail": "Configured property is not initialized."}, status=status.HTTP_404_NOT_FOUND)
        return self._response(prop, prop.settings)

    def patch(self, request):
        prop_id = get_active_property_id()
        if not Property.objects.filter(pk=prop_id).exists():
            return Response({"detail": "Configured property is not initialized."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PropertySettingsUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        updates = serializer.validated_data
        room_rents = updates.pop('roomRents', {})
        available_rooms = {
            room.number: room.id
            for room in Room.objects.filter(property_id=prop_id).only('id', 'number')
        }
        unknown_rooms = set(room_rents) - set(available_rooms)
        if unknown_rooms:
            return Response({"roomRents": f"Unknown room number(s): {', '.join(sorted(unknown_rooms))}."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            prop = Property.objects.select_for_update().get(pk=prop_id)
            settings = PropertySettings.objects.select_for_update().get(property=prop)
            property_fields = {'propertyName': 'name', 'location': 'location', 'currency': 'currency'}
            settings_fields = {
                'landlordName': 'landlord_name', 'landlordInitials': 'landlord_initials',
                'landlordPhone': 'landlord_phone', 'landlordEmail': 'landlord_email',
                'defaultDueDay': 'default_due_day', 'autoGenerateCharges': 'auto_generate_charges',
            }
            for api_name, model_name in property_fields.items():
                if api_name in updates:
                    setattr(prop, model_name, updates[api_name])
            if any(key in updates for key in property_fields):
                prop.save()
            for api_name, model_name in settings_fields.items():
                if api_name in updates:
                    setattr(settings, model_name, updates[api_name])
            if any(key in updates for key in settings_fields):
                settings.save()
            for room_num, rent in room_rents.items():
                Room.objects.filter(property_id=prop_id, number=room_num).update(default_rent=rent)

        return self._response(prop, settings)
