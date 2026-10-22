from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import Tenant, Tenancy
from .serializers import (
    TenantSerializer,
    TenancySerializer,
    TenantRegistrationSerializer,
    MoveOutSerializer,
)


class TenantViewSet(viewsets.ModelViewSet):
    serializer_class = TenantSerializer

    def get_queryset(self):
        qs = Tenant.objects.all().prefetch_related('tenancies__room')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(phone__icontains=search))
        status_param = self.request.query_params.get('status')
        if status_param in ('active', 'former'):
            qs = qs.filter(status=status_param)
        return qs.order_by('full_name')


class TenancyViewSet(viewsets.ModelViewSet):
    serializer_class = TenancySerializer

    def get_queryset(self):
        qs = Tenancy.objects.all().select_related('tenant', 'room')
        room_id = self.request.query_params.get('roomId')
        if room_id:
            qs = qs.filter(room_id=room_id)
        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        status_param = self.request.query_params.get('status')
        if status_param in ('active', 'ended'):
            qs = qs.filter(status=status_param)
        return qs.order_by('-start_date')

    @action(detail=False, methods=['post'], url_path='register')
    def register(self, request):
        serializer = TenantRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        tenancy = serializer.save()
        response_serializer = TenancySerializer(tenancy)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='move-out')
    def move_out(self, request, pk=None):
        tenancy = self.get_object()
        if tenancy.status == 'ended':
            return Response(
                {"error": "This tenancy has already ended."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = MoveOutSerializer(instance=tenancy, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_tenancy = serializer.save()
        return Response(TenancySerializer(updated_tenancy).data, status=status.HTTP_200_OK)
