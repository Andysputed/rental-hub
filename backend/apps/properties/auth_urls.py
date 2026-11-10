from django.urls import path
from .auth_views import (
    LoginView, LogoutView, MeView, csrf_token_view,
    PasswordResetRequestView, PasswordResetConfirmView,
)

urlpatterns = [
    path('auth/csrf/', csrf_token_view, name='auth-csrf'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('auth/password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
]

