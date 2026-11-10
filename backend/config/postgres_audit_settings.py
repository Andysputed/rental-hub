"""Temporary, explicitly named PostgreSQL database settings for live concurrency tests."""
import os
from .settings import *  # noqa: F403

if os.getenv('RENTALHUB_AUDIT_DB_NAME') != 'rentalhub_audit_test_20261109_7d914a3f':
    raise RuntimeError('Refusing PostgreSQL audit tests without the exact isolated database name.')

DATABASES['default']['TEST'] = {  # noqa: F405
    'NAME': 'test_rentalhub_audit_test_20261109_7d914a3f',
}
