from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.conf import settings as django_settings
from apps.properties.services import get_active_property_id
from .models import RentCharge
from .serializers import RentChargeSerializer, GenerateChargesRequestSerializer
from .services import generate_monthly_charges


class RentChargeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = RentChargeSerializer

    def get_queryset(self):
        active_prop_id = get_active_property_id()
        qs = RentCharge.objects.all().select_related('tenancy__tenant', 'room')
        if active_prop_id:
            qs = qs.filter(room__property_id=active_prop_id)

        month = self.request.query_params.get('month')
        if month:
            qs = qs.filter(month=month)

        room_id = self.request.query_params.get('roomId')
        if room_id:
            qs = qs.filter(room_id=room_id)

        tenancy_id = self.request.query_params.get('tenancyId')
        if tenancy_id:
            qs = qs.filter(tenancy_id=tenancy_id)

        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id:
            qs = qs.filter(tenancy__tenant_id=tenant_id)

        status_param = self.request.query_params.get('status')
        if status_param in ('unpaid', 'partial', 'paid', 'overdue'):
            qs = qs.filter(status=status_param)

        return qs.order_by('-month', 'room__number')

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        serializer = GenerateChargesRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        month = serializer.validated_data['month']
        created_count, skipped_count, total_amount = generate_monthly_charges(month=month)

        # Retrieve the updated charges for the month
        charges = self.get_queryset().filter(month=month)
        charges_data = RentChargeSerializer(charges, many=True).data

        return Response({
            'month': month,
            'createdCount': created_count,
            'skippedCount': skipped_count,
            'totalAmount': float(total_amount),
            'message': f"{created_count} charges generated for {month}." if created_count > 0 else f"All {skipped_count} charges for {month} are already generated.",
            'charges': charges_data
        }, status=status.HTTP_200_OK)
