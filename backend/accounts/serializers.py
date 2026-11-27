from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'first_name', 'last_name', 'name',
            'role', 'is_verified', 'is_active', 'avatar_color', 'created_at', 'last_login',
        )
        read_only_fields = ('id', 'username', 'role', 'is_verified', 'is_active', 'created_at', 'last_login')

    def get_name(self, obj):
        full = f'{obj.first_name} {obj.last_name}'.strip()
        return full or obj.username


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    avatar_color = serializers.CharField(max_length=16, required=False, default='#6c8cff')

    def validate_username(self, value):
        cleaned = value.strip().lower()
        if not cleaned.replace('_', '').replace('-', '').isalnum():
            raise serializers.ValidationError('Username may only contain letters, numbers, underscores, and hyphens.')
        if User.objects.filter(username__iexact=cleaned).exists():
            raise serializers.ValidationError('This username is already taken.')
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip().lower()
        if User.objects.filter(email__iexact=cleaned).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return cleaned

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        full_name = validated_data['name'].strip()
        parts = full_name.split(None, 1)
        first_name = parts[0] if parts else ''
        last_name = parts[1] if len(parts) > 1 else ''
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
            role=User.Role.STUDENT,
            avatar_color=validated_data.get('avatar_color', '#6c8cff'),
        )


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs['identifier'].strip()
        password = attrs['password']

        user_obj = User.objects.filter(email__iexact=identifier).first()
        username = user_obj.username if user_obj else identifier.lower()

        user = authenticate(username=username, password=password)
        if not user:
            # Check if account exists but is inactive
            existing = User.objects.filter(username__iexact=username).first()
            if existing and not existing.is_active and existing.check_password(password):
                raise serializers.ValidationError('This account has been deactivated. Contact an administrator.')
            raise serializers.ValidationError('Invalid username/email or password.')
        if not user.is_active:
            raise serializers.ValidationError('This account has been deactivated.')
        attrs['user'] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value, user=self.context.get('user'))
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value
