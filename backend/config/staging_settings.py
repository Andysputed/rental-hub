"""
Isolated staging settings for RentalHub.

Safety contract:
- Loads only backend/.env.staging; never the production/local .env file.
- Refuses to start if DATABASE_URL is present in the process environment.
- Only connects to a loopback PostgreSQL database named "rentalhub_staging"
  on port 55432, matching the dedicated cluster in scripts/staging-db.sh.
- Uses a separate test database name so `manage.py test` never touches seeded
  staging data.
"""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env.staging', override=False)

if os.getenv('DATABASE_URL'):
    raise ImproperlyConfigured(
        'config.staging_settings refuses to run with DATABASE_URL set. '
        'Use the STAGING_DB_* variables instead.'
    )

# Prevent config.settings from loading backend/.env.
os.environ['DJANGO_ENV'] = 'staging'

from .settings import *  # noqa: E402,F401,F403

_db_name = os.getenv('STAGING_DB_NAME', '')
_db_user = os.getenv('STAGING_DB_USER', '')
_db_password = os.getenv('STAGING_DB_PASSWORD', '')
_db_host = os.getenv('STAGING_DB_HOST', '127.0.0.1')
_db_port = os.getenv('STAGING_DB_PORT', '')

if _db_name != 'rentalhub_staging':
    raise ImproperlyConfigured('STAGING_DB_NAME must be exactly "rentalhub_staging".')
if _db_host not in ('127.0.0.1', 'localhost', '::1'):
    raise ImproperlyConfigured('The staging database host must be loopback.')
if _db_port != '55432':
    raise ImproperlyConfigured('The staging database must run on port 55432.')
if not _db_user:
    raise ImproperlyConfigured('STAGING_DB_USER is required.')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': _db_name,
        'USER': _db_user,
        'PASSWORD': _db_password,
        'HOST': _db_host,
        'PORT': _db_port,
        'CONN_MAX_AGE': 0,
        # The Django test runner creates this separate database, so running the
        # suite cannot mutate the seeded staging dataset.
        'TEST': {'NAME': 'test_rentalhub_staging'},
    }
}

DEBUG = True
SECRET_KEY = os.getenv('STAGING_SECRET_KEY', 'staging-only-secret-key-not-for-production')
ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
RENTALHUB_STAGING = True
