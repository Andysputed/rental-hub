"""
Tests for RentalHub token authentication.

Verifies:
- Login with valid credentials returns a token
- Login with bad credentials is rejected
- Missing fields are rejected
- Authenticated /auth/me/ returns user info
- Unauthenticated requests to protected endpoints are rejected (401)
- Authenticated requests to protected endpoints succeed
- Logout invalidates the token
"""

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


class LoginViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='landlord',
            password='strongpass123',
            email='landlord@example.com',
            first_name='Veronicah',
            last_name='Kaptingei',
        )
        self.login_url = '/api/v1/auth/login/'

    def test_login_valid_credentials_returns_token(self):
        res = self.client.post(self.login_url, {'username': 'landlord', 'password': 'strongpass123'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('token', res.data)
        self.assertEqual(res.data['username'], 'landlord')
        self.assertIsInstance(res.data['token'], str)
        self.assertTrue(len(res.data['token']) > 10)

    def test_login_wrong_password_rejected(self):
        res = self.client.post(self.login_url, {'username': 'landlord', 'password': 'wrong'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('error', res.data)

    def test_login_unknown_user_rejected(self):
        res = self.client.post(self.login_url, {'username': 'nobody', 'password': 'anything'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_username_rejected(self):
        res = self.client.post(self.login_url, {'password': 'strongpass123'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_missing_password_rejected(self):
        res = self.client.post(self.login_url, {'username': 'landlord'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save()
        res = self.client.post(self.login_url, {'username': 'landlord', 'password': 'strongpass123'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_repeated_login_returns_same_token(self):
        res1 = self.client.post(self.login_url, {'username': 'landlord', 'password': 'strongpass123'}, format='json')
        res2 = self.client.post(self.login_url, {'username': 'landlord', 'password': 'strongpass123'}, format='json')
        self.assertEqual(res1.data['token'], res2.data['token'])


class MeViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='landlord',
            password='strongpass123',
            email='landlord@example.com',
            first_name='Veronicah',
            last_name='Kaptingei',
        )
        self.token = Token.objects.create(user=self.user)
        self.me_url = '/api/v1/auth/me/'

    def test_me_authenticated_returns_user_info(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        res = self.client.get(self.me_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['username'], 'landlord')

    def test_me_unauthenticated_rejected(self):
        res = self.client.get(self.me_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_invalid_token_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION='Token invalidtoken123')
        res = self.client.get(self.me_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class LogoutViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='landlord', password='strongpass123')
        self.token = Token.objects.create(user=self.user)
        self.logout_url = '/api/v1/auth/logout/'

    def test_logout_deletes_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        res = self.client.post(self.logout_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Token must be gone from DB
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_logout_unauthenticated_rejected(self):
        res = self.client.post(self.logout_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_invalid_after_logout(self):
        key = self.token.key
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {key}')
        self.client.post(self.logout_url)
        # Using the now-deleted token should fail
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {key}')
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ProtectedEndpointTests(APITestCase):
    """
    Spot-checks that key data endpoints require authentication.
    """
    def setUp(self):
        self.user = User.objects.create_user(username='landlord', password='strongpass123')
        self.token = Token.objects.create(user=self.user)

    def _protected_urls(self):
        return [
            '/api/v1/rooms/',
            '/api/v1/tenants/',
            '/api/v1/rent-charges/',
            '/api/v1/payments/',
            '/api/v1/expenses/',
            '/api/v1/settings/',
        ]

    def test_unauthenticated_gets_rejected(self):
        for url in self._protected_urls():
            with self.subTest(url=url):
                res = self.client.get(url)
                self.assertEqual(
                    res.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                    msg=f'Expected 401 for {url}, got {res.status_code}',
                )

    def test_authenticated_gets_accepted(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        for url in self._protected_urls():
            with self.subTest(url=url):
                res = self.client.get(url)
                self.assertNotEqual(
                    res.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                    msg=f'Authenticated request to {url} was rejected',
                )

