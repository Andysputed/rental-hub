from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    # Auth endpoints (login/logout/me) — open before the protected API
    path('api/v1/', include('apps.properties.auth_urls')),
    # Core REST API v1 routes
    path('api/v1/', include('apps.properties.urls')),
    path('api/v1/', include('apps.tenants.urls')),
    path('api/v1/', include('apps.rent.urls')),
    path('api/v1/', include('apps.payments.urls')),
    path('api/v1/', include('apps.expenses.urls')),
    path('api/v1/', include('apps.reports.urls')),
]
