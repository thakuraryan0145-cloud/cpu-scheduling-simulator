from rest_framework import permissions


class IsAdminRole(permissions.BasePermission):
    """Allow access only to authenticated users with the ADMIN role or superuser status."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_admin_role
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    """Allow access to the resource owner or an administrator."""

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_admin_role:
            return True
        return getattr(obj, 'user_id', None) == request.user.id
