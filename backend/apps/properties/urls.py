from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoomViewSet, PropertySettingsView

router = DefaultRouter()
router.register(r'rooms', RoomViewSet, basename='room')

urlpatterns = [
    path('settings/', PropertySettingsView.as_view(), name='property-settings'),
    path('', include(router.urls)),
]
