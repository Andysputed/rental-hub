"""Landlord-only session authentication with explicit CSRF protection."""
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.http import JsonResponse
from django.conf import settings
from django.core.exceptions import ValidationError
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class LandlordPasswordResetForm(PasswordResetForm):
    def get_users(self, email):
        return (user for user in super().get_users(email) if user.is_superuser)


def _user_payload(user):
    return {
        'username': user.username,
        'email': user.email,
        'firstName': user.first_name,
        'lastName': user.last_name,
    }


@ensure_csrf_cookie
def csrf_token_view(request):
    """Issue the CSRF cookie and return its masked token to the SPA."""
    return JsonResponse({'csrfToken': get_token(request)})


@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'login'

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = request.data.get('password', '')
        if not username or not isinstance(password, str) or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)
        if not user or not user.is_active or not user.is_superuser:
            return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Django rotates the session key and CSRF secret as part of login.
        auth_login(request, user)
        return Response(_user_payload(user), status=status.HTTP_200_OK)


class LogoutView(APIView):
    def post(self, request):
        auth_logout(request)
        return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)


class MeView(APIView):
    def get(self, request):
        return Response(_user_payload(request.user), status=status.HTTP_200_OK)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


@method_decorator(csrf_protect, name='dispatch')
class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'password_reset'
    generic_response = {
        'detail': 'If an eligible account exists for that address, password reset instructions will be sent.'
    }

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        form = LandlordPasswordResetForm(data={'email': serializer.validated_data['email']})
        if form.is_valid():
            form.save(
                request=request,
                use_https=request.is_secure(),
                email_template_name='registration/password_reset_email.txt',
                subject_template_name='registration/password_reset_subject.txt',
                extra_email_context={
                    'frontend_reset_url': settings.FRONTEND_PASSWORD_RESET_URL,
                },
            )
        return Response(self.generic_response, status=status.HTTP_200_OK)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=128)
    token = serializers.CharField(max_length=256)
    newPassword = serializers.CharField(write_only=True, trim_whitespace=False, min_length=12)

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=user_id, is_active=True, is_superuser=True)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({'token': 'This password reset link is invalid or has expired.'})
        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError({'token': 'This password reset link is invalid or has expired.'})
        try:
            validate_password(attrs['newPassword'], user=user)
        except ValidationError as exc:
            raise serializers.ValidationError({'newPassword': list(exc.messages)})
        attrs['user'] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data['user']
        user.set_password(self.validated_data['newPassword'])
        user.save(update_fields=['password'])
        return user


@method_decorator(csrf_protect, name='dispatch')
class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'password_reset_confirm'

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response({'detail': 'Password updated. You may now sign in.'}, status=status.HTTP_200_OK)
