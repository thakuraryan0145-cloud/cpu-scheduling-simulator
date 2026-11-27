from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, EmailVerificationToken, PasswordResetToken


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'is_verified', 'is_active', 'created_at')
    list_filter = ('role', 'is_verified', 'is_active')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Platform Role & Profile', {'fields': ('role', 'is_verified', 'avatar_color')}),
    )


admin.site.register(EmailVerificationToken)
admin.site.register(PasswordResetToken)
