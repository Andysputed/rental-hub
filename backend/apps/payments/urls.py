from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PaymentViewSet, DepositViewSet

router = DefaultRouter()
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'deposits', DepositViewSet, basename='deposit')

urlpatterns = [
    path('', include(router.urls)),
]
