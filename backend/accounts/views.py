from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EmailVerificationToken, PasswordResetToken, User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)


def _send_verification_email(user, request):
    token_obj = EmailVerificationToken.objects.create(user=user)
    verify_url = request.build_absolute_uri(f'/login.html?verify_token={token_obj.token}')
    send_mail(
        subject='Verify your CPU Scheduling Simulator account',
        message=(
            f'Hello {user.username},\n\n'
            f'Please verify your email address by opening the link below:\n{verify_url}\n\n'
            f'Or paste this verification token in the app: {token_obj.token}\n'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )
    return token_obj


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        _send_verification_email(user, request)
        return Response(
            {
                'token': token.key,
                'user': UserSerializer(user).data,
                'message': 'Account created successfully. A verification link has been sent to your email.',
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data,
            'message': f'Welcome back, {user.first_name or user.username}!',
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({'message': 'Signed out successfully.'})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'user': UserSerializer(request.user).data})

    def patch(self, request):
        user = request.user
        allowed = ('first_name', 'last_name', 'email', 'avatar_color')
        for field in allowed:
            if field in request.data:
                val = str(request.data[field]).strip()
                if field == 'email':
                    val = val.lower()
                    if User.objects.filter(email__iexact=val).exclude(pk=user.pk).exists():
                        return Response({'detail': 'Email is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
                    if val != user.email:
                        user.is_verified = False
                setattr(user, field, val)
        user.save()
        return Response({'user': UserSerializer(user).data, 'message': 'Profile updated.'})


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'user': request.user})
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data['current_password']):
            return Response({'detail': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        Token.objects.filter(user=request.user).delete()
        new_token = Token.objects.create(user=request.user)
        return Response({'message': 'Password updated successfully.', 'token': new_token.key})


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def _verify(self, token_str):
        if not token_str:
            return Response({'detail': 'Verification token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        token_obj = EmailVerificationToken.objects.filter(token=token_str).select_related('user').first()
        if not token_obj or not token_obj.is_valid:
            return Response({'detail': 'Invalid or expired verification token.'}, status=status.HTTP_400_BAD_REQUEST)
        token_obj.used = True
        token_obj.save(update_fields=['used'])
        token_obj.user.is_verified = True
        token_obj.user.save(update_fields=['is_verified'])
        return Response({'message': 'Email verified successfully.', 'user': UserSerializer(token_obj.user).data})

    def post(self, request):
        return self._verify(request.data.get('token', '').strip())

    def get(self, request):
        return self._verify(request.query_params.get('token', '').strip())


class ResendVerificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.is_verified:
            return Response({'message': 'Your email is already verified.'})
        _send_verification_email(request.user, request)
        return Response({'message': 'Verification email sent. Check your inbox (or server console in dev).'})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            token_obj = PasswordResetToken.objects.create(user=user)
            reset_url = request.build_absolute_uri(f'/login.html?reset_token={token_obj.token}')
            send_mail(
                subject='Reset your CPU Scheduling Simulator password',
                message=(
                    f'Hello {user.username},\n\n'
                    f'Reset your password using the link below:\n{reset_url}\n\n'
                    f'Or paste this reset token: {token_obj.token}\n'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        return Response({'message': 'If an account matches that email, a password reset link has been sent.'})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token_obj = PasswordResetToken.objects.filter(
            token=serializer.validated_data['token'].strip()
        ).select_related('user').first()
        if not token_obj or not token_obj.is_valid:
            return Response({'detail': 'Invalid or expired password reset token.'}, status=status.HTTP_400_BAD_REQUEST)
        user = token_obj.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        token_obj.used = True
        token_obj.save(update_fields=['used'])
        Token.objects.filter(user=user).delete()
        return Response({'message': 'Password has been reset. You can now sign in.'})
