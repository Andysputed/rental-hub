import os
from unittest import skipIf

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.settings import cookie_samesite_overrides


class CookieSameSiteDefaultTests(SimpleTestCase):
    @skipIf('COOKIE_SAMESITE' in os.environ, 'COOKIE_SAMESITE is set in this environment.')
    def test_unset_keeps_existing_cookie_behavior(self):
        self.assertEqual(cookie_samesite_overrides({}), {})
        self.assertEqual(settings.SESSION_COOKIE_SAMESITE, 'Lax')
        self.assertEqual(settings.CSRF_COOKIE_SAMESITE, 'Lax')
        self.assertFalse(settings.SESSION_COOKIE_SECURE)
        self.assertFalse(settings.CSRF_COOKIE_SECURE)


class CookieSameSiteNoneTests(SimpleTestCase):
    def test_none_applies_to_both_cookies(self):
        overrides = cookie_samesite_overrides({'COOKIE_SAMESITE': 'None'})
        self.assertEqual(overrides['SESSION_COOKIE_SAMESITE'], 'None')
        self.assertEqual(overrides['CSRF_COOKIE_SAMESITE'], 'None')

    def test_none_forces_both_secure_flags(self):
        overrides = cookie_samesite_overrides({'COOKIE_SAMESITE': 'None'})
        self.assertIs(overrides['SESSION_COOKIE_SECURE'], True)
        self.assertIs(overrides['CSRF_COOKIE_SECURE'], True)

    def test_value_is_case_insensitive(self):
        overrides = cookie_samesite_overrides({'COOKIE_SAMESITE': 'none'})
        self.assertEqual(overrides['SESSION_COOKIE_SAMESITE'], 'None')
        self.assertEqual(overrides['CSRF_COOKIE_SAMESITE'], 'None')


class CookieSameSiteValidationTests(SimpleTestCase):
    def test_invalid_value_fails_closed(self):
        with self.assertRaises(ImproperlyConfigured):
            cookie_samesite_overrides({'COOKIE_SAMESITE': 'Sometimes'})

    def test_lax_does_not_force_secure_flags(self):
        overrides = cookie_samesite_overrides({'COOKIE_SAMESITE': 'Lax'})
        self.assertEqual(overrides['SESSION_COOKIE_SAMESITE'], 'Lax')
        self.assertEqual(overrides['CSRF_COOKIE_SAMESITE'], 'Lax')
        self.assertNotIn('SESSION_COOKIE_SECURE', overrides)
        self.assertNotIn('CSRF_COOKIE_SECURE', overrides)
