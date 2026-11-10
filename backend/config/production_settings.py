"""Fail-closed settings for an HTTPS production deployment."""
import os
from django.core.exceptions import ImproperlyConfigured

os.environ['DJANGO_ENV'] = 'production'
from .settings import *  # noqa: F403,E402


def required(name):
    value = os.getenv(name, '').strip()
    if not value:
        raise ImproperlyConfigured(f"Required production setting {name} is missing.")
    return value


def required_csv(name, *, https_only=False):
    values = [item.strip() for item in required(name).split(',') if item.strip()]
    if not values or (https_only and any(not item.startswith('https://') for item in values)):
        raise ImproperlyConfigured(f"Production setting {name} must contain explicit HTTPS origins.")
    if any('*' in item for item in values):
        raise ImproperlyConfigured(f"Production setting {name} cannot contain a wildcard.")
    if https_only:
        from urllib.parse import urlsplit
        for item in values:
            parsed = urlsplit(item)
            if parsed.scheme != 'https' or not parsed.netloc or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
                raise ImproperlyConfigured(f"Production setting {name} must contain HTTPS origins without paths or query strings.")
    elif any('://' in item or '/' in item or item.isspace() for item in values):
        raise ImproperlyConfigured(f"Production setting {name} must contain hostnames only.")
    return values


if os.getenv('DEBUG', '').strip().lower() not in ('false', '0', 'no'):
    raise ImproperlyConfigured("Production requires DEBUG=False to be explicitly set.")
DEBUG = False

SECRET_KEY = required('SECRET_KEY')
if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 10 or 'change' in SECRET_KEY.lower() or 'insecure' in SECRET_KEY.lower():
    raise ImproperlyConfigured("Production SECRET_KEY must be a unique, high-entropy value of at least 50 characters.")

ALLOWED_HOSTS = required_csv('ALLOWED_HOSTS')
if any('localhost' in host or host == '127.0.0.1' for host in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Production ALLOWED_HOSTS must contain only deployed hostnames.")
CORS_ALLOWED_ORIGINS = required_csv('CORS_ALLOWED_ORIGINS', https_only=True)
CSRF_TRUSTED_ORIGINS = required_csv('CSRF_TRUSTED_ORIGINS', https_only=True)

if os.getenv('DB_ENGINE', '').strip().lower() != 'postgresql':
    raise ImproperlyConfigured("Production requires DB_ENGINE=postgresql.")
for name in ('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'):
    required(name)
if os.getenv('DB_USER', '').strip().lower() in {'postgres', 'root', 'admin'}:
    raise ImproperlyConfigured("Production must use a dedicated least-privilege PostgreSQL role.")

sslmode = required('DB_SSLMODE').lower()
if sslmode not in {'require', 'verify-ca', 'verify-full'}:
    raise ImproperlyConfigured("DB_SSLMODE must require encrypted PostgreSQL transport.")
DATABASES['default']['OPTIONS'] = {
    **DATABASES['default'].get('OPTIONS', {}),
    'sslmode': sslmode,
    'connect_timeout': int(os.getenv('DB_CONNECT_TIMEOUT', '10')),
}
if sslmode in {'verify-ca', 'verify-full'}:
    DATABASES['default']['OPTIONS']['sslrootcert'] = required('DB_SSL_ROOT_CERT')
DATABASES['default']['CONN_MAX_AGE'] = int(os.getenv('DB_CONN_MAX_AGE', '60'))
DATABASES['default']['CONN_HEALTH_CHECKS'] = True

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv('COOKIE_SAMESITE', 'Lax')
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE
SESSION_COOKIE_AGE = int(os.getenv('SESSION_COOKIE_AGE', '43200'))
if SESSION_COOKIE_AGE < 300:
    raise ImproperlyConfigured('SESSION_COOKIE_AGE must be at least five minutes.')
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_SAVE_EVERY_REQUEST = True
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
if os.getenv('HTTPS_CONFIRMED', '').lower() not in {'true', '1', 'yes'} or SECURE_HSTS_SECONDS < 1:
    raise ImproperlyConfigured("Set HTTPS_CONFIRMED=true only after HTTPS is active; production HSTS must be enabled.")
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv('SECURE_HSTS_INCLUDE_SUBDOMAINS', 'false').lower() in {'true', '1', 'yes'}
SECURE_HSTS_PRELOAD = os.getenv('SECURE_HSTS_PRELOAD', 'false').lower() in {'true', '1', 'yes'}
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'

# Only trust forwarded scheme headers when the chosen hosting proxy overwrites
# this header and direct access to Gunicorn is blocked.
if os.getenv('TRUST_PROXY_SSL_HEADER', '').lower() in {'true', '1', 'yes'}:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': os.getenv('CACHE_TABLE', 'rentalhub_cache'),
        'TIMEOUT': 300,
    }
}

DEFAULT_RENDERER_CLASSES = ['rest_framework.renderers.JSONRenderer']
REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = DEFAULT_RENDERER_CLASSES

FRONTEND_PASSWORD_RESET_URL = required('FRONTEND_PASSWORD_RESET_URL')
if not FRONTEND_PASSWORD_RESET_URL.startswith('https://'):
    raise ImproperlyConfigured('FRONTEND_PASSWORD_RESET_URL must use HTTPS in production.')
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = required('EMAIL_HOST')
EMAIL_PORT = int(required('EMAIL_PORT'))
EMAIL_HOST_USER = required('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = required('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = required('DEFAULT_FROM_EMAIL')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'true').lower() in {'true', '1', 'yes'}
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'false').lower() in {'true', '1', 'yes'}
if EMAIL_USE_TLS == EMAIL_USE_SSL:
    raise ImproperlyConfigured('Configure exactly one of EMAIL_USE_TLS or EMAIL_USE_SSL.')
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', '10'))

SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
CORS_EXPOSE_HEADERS = ['X-Request-ID']

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {'()': 'config.middleware.JsonLogFormatter'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'json'},
    },
    'root': {'handlers': ['console'], 'level': os.getenv('LOG_LEVEL', 'INFO')},
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'rentalhub.request': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
