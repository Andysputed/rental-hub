from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TenantViewSet, TenancyViewSet

router = DefaultRouter()
router.register(r'tenants', TenantViewSet, basename='tenant')
router.register(r'tenancies', TenancyViewSet, basename='tenancy')

urlpatterns = [
    path('', include(router.urls)),
]
