from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import EmailVerificationToken, PasswordResetToken, User
from accounts.permissions import IsAdminRole


class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.register_url = reverse('auth-register')
        self.login_url = reverse('auth-login')
        self.logout_url = reverse('auth-logout')
        self.me_url = reverse('auth-me')

    def test_register_creates_student_with_hashed_password(self):
        res = self.client.post(self.register_url, {
            'name': 'Ada Lovelace',
            'username': 'ada',
            'email': 'ada@university.edu',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', res.data)
        user = User.objects.get(username='ada')
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertNotEqual(user.password, 'StrongPassword123!')
        self.assertTrue(user.check_password('StrongPassword123!'))
        self.assertFalse(user.is_verified)

    def test_register_ignores_role_escalation_attempt(self):
        res = self.client.post(self.register_url, {
            'name': 'Bob',
            'username': 'bob',
            'email': 'bob@university.edu',
            'password': 'StrongPassword123!',
            'role': 'ADMIN',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username='bob').role, User.Role.STUDENT)

    def test_login_by_username_and_email_and_logout(self):
        User.objects.create_user(
            username='student1',
            email='s1@university.edu',
            password='StrongPassword123!',
        )
        res1 = self.client.post(self.login_url, {
            'identifier': 'student1',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        token = res1.data['token']

        res2 = self.client.post(self.login_url, {
            'identifier': 's1@university.edu',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        me_res = self.client.get(self.me_url)
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data['user']['username'], 'student1')

        out_res = self.client.post(self.logout_url)
        self.assertEqual(out_res.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.me_url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deactivated_user_cannot_login(self):
        User.objects.create_user(
            username='inactive_u',
            email='inactive@university.edu',
            password='StrongPassword123!',
            is_active=False,
        )
        res = self.client.post(self.login_url, {
            'identifier': 'inactive_u',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_verification_and_password_reset_flow(self):
        self.client.post(self.register_url, {
            'name': 'Grace Hopper',
            'username': 'grace',
            'email': 'grace@university.edu',
            'password': 'OldPassword123!',
        }, format='json')
        user = User.objects.get(username='grace')
        v_token = EmailVerificationToken.objects.get(user=user).token

        verify_res = self.client.post(reverse('auth-verify-email'), {'token': v_token}, format='json')
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.is_verified)

        reset_req = self.client.post(reverse('auth-password-reset'), {'email': 'grace@university.edu'}, format='json')
        self.assertEqual(reset_req.status_code, status.HTTP_200_OK)
        r_token = PasswordResetToken.objects.get(user=user).token

        reset_conf = self.client.post(reverse('auth-password-reset-confirm'), {
            'token': r_token,
            'new_password': 'NewStrongPassword456!',
        }, format='json')
        self.assertEqual(reset_conf.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password('NewStrongPassword456!'))

    def test_is_admin_role_permission(self):
        student = User.objects.create_user(username='st', email='st@u.edu', password='StrongPassword123!')
        admin = User.objects.create_user(
            username='adm', email='adm@u.edu', password='StrongPassword123!', role=User.Role.ADMIN
        )
        perm = IsAdminRole()

        class Req:
            def __init__(self, u):
                self.user = u

        self.assertFalse(perm.has_permission(Req(student), None))
        self.assertTrue(perm.has_permission(Req(admin), None))
