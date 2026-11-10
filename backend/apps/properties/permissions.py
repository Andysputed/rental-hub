from rest_framework.permissions import BasePermission


class IsLandlord(BasePermission):
    """Only the configured single-property landlord account may use the API."""
    message = 'Landlord administrator access is required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_superuser)
