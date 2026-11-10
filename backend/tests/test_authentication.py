from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase, APIClient


class SessionAuthenticationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_superuser(
            username='landlord', password='strongpass123', email='landlord@example.com',
            first_name='Veronicah', last_name='Kaptingei',
        )

    def test_login_creates_server_session_without_returning_token(self):
        response = self.client.post('/api/v1/auth/login/', {
            'username': 'landlord', 'password': 'strongpass123',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('token', response.data)
        self.assertEqual(response.data['username'], 'landlord')
        self.assertIn('sessionid', response.cookies)
        self.assertTrue(self.client.get('/api/v1/auth/me/').data['username'] == 'landlord')

    def test_non_superuser_cannot_access_landlord_api(self):
        User.objects.create_user(username='staff', email='staff@example.com', password='strongpass123', is_staff=True)
        response = self.client.post('/api/v1/auth/login/', {'username': 'staff', 'password': 'strongpass123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error'], 'Invalid username or password.')

    def test_login_wrong_password_and_unknown_user_share_same_response(self):
        wrong = self.client.post('/api/v1/auth/login/', {'username': 'landlord', 'password': 'bad'}, format='json')
        missing = self.client.post('/api/v1/auth/login/', {'username': 'nobody', 'password': 'bad'}, format='json')
        self.assertEqual(wrong.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(wrong.data, missing.data)

    def test_login_requires_csrf_token_in_browser_client(self):
        client = APIClient(enforce_csrf_checks=True)
        csrf = client.get('/api/v1/auth/csrf/')
        response = client.post('/api/v1/auth/login/', {
            'username': 'landlord', 'password': 'strongpass123',
        }, format='json')
        self.assertEqual(response.status_code, 403)
        accepted = client.post('/api/v1/auth/login/', {
            'username': 'landlord', 'password': 'strongpass123',
        }, format='json', HTTP_X_CSRFTOKEN=csrf.json()['csrfToken'])
        self.assertEqual(accepted.status_code, 200)

    def test_logout_invalidates_server_session(self):
        self.client.force_login(self.user)
        response = self.client.post('/api/v1/auth/logout/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        me = self.client.get('/api/v1/auth/me/')
        self.assertNotEqual(me.status_code, 200)

    def test_anonymous_cannot_access_protected_api(self):
        response = self.client.get('/api/v1/tenants/')
        self.assertIn(response.status_code, (401, 403))

    def test_login_is_throttled(self):
        for _ in range(5):
            self.client.post('/api/v1/auth/login/', {'username': 'landlord', 'password': 'bad'}, format='json')
        response = self.client.post('/api/v1/auth/login/', {'username': 'landlord', 'password': 'bad'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_superuser(
            username='landlord', password='strongpass123', email='landlord@example.com',
        )

    def test_password_reset_email_is_generic_and_token_is_single_use(self):
        response = self.client.post('/api/v1/auth/password-reset/', {'email': 'landlord@example.com'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        self.assertIn('uid=', body)
        self.assertIn('token=', body)
        query = body.split('?uid=', 1)[1].splitlines()[0]
        uid, token = query.split('&token=')

        confirm = self.client.post('/api/v1/auth/password-reset/confirm/', {
            'uid': uid, 'token': token, 'newPassword': 'A-new-strong-password-2026!',
        }, format='json')
        self.assertEqual(confirm.status_code, 200, confirm.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('A-new-strong-password-2026!'))
        replay = self.client.post('/api/v1/auth/password-reset/confirm/', {
            'uid': uid, 'token': token, 'newPassword': 'Another-new-password-2026!',
        }, format='json')
        self.assertEqual(replay.status_code, 400)

    def test_unknown_email_gets_same_reset_response_without_email(self):
        response = self.client.post('/api/v1/auth/password-reset/', {'email': 'missing@example.com'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['detail'], 'If an eligible account exists for that address, password reset instructions will be sent.')
        self.assertEqual(len(mail.outbox), 0)
