"""
Authentication views for RentalHub.

Single-landlord token authentication.
- POST /api/v1/auth/login/  — exchange username + password for a DRF token
- POST /api/v1/auth/logout/ — delete the current token (requires auth)
- GET  /api/v1/auth/me/     — return the authenticated user's basic info
"""

from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class LoginView(APIView):
    """
    Accepts POST { username, password } and returns an auth token.
    Open to unauthenticated requests (AllowAny).
    """
    authentication_classes = []   # No auth required to log in
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username or not password:
            return Response(
                {'error': 'Both username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {'error': 'Invalid credentials. Please check your username and password.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {'error': 'This account is disabled.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'token': token.key,
            'username': user.username,
            'email': user.email,
            'firstName': user.first_name,
            'lastName': user.last_name,
        })


class LogoutView(APIView):
    """
    Deletes the current user's auth token, effectively logging them out.
    Requires a valid token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            request.user.auth_token.delete()
        except Token.DoesNotExist:
            pass
        return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)


class MeView(APIView):
    """
    Returns the currently authenticated user's basic profile.
    Used by the frontend to validate a stored token on startup.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'username': user.username,
            'email': user.email,
            'firstName': user.first_name,
            'lastName': user.last_name,
        })

