from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RentChargeViewSet

router = DefaultRouter()
router.register(r'rent-charges', RentChargeViewSet, basename='rent-charge')

urlpatterns = [
    path('', include(router.urls)),
]
