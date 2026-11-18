"""Non-bypassable guards for commands that write or delete staging data."""
from django.conf import settings
from django.core.management.base import CommandError

STAGING_DB_NAME = 'rentalhub_staging'
STAGING_DB_PORT = '55432'
LOOPBACK_HOSTS = {'127.0.0.1', 'localhost', '::1'}


def assert_staging(action: str) -> None:
    db = settings.DATABASES.get('default', {})
    host = str(db.get('HOST') or '')
    problems = []

    if not getattr(settings, 'RENTALHUB_STAGING', False):
        problems.append('RENTALHUB_STAGING is not enabled (use config.staging_settings)')
    if db.get('NAME') != STAGING_DB_NAME:
        problems.append(f"database name is {db.get('NAME')!r}, expected {STAGING_DB_NAME!r}")
    if host not in LOOPBACK_HOSTS:
        problems.append(f'database host {host!r} is not loopback')
    if str(db.get('PORT')) != STAGING_DB_PORT:
        problems.append(f"database port is {db.get('PORT')!r}, expected {STAGING_DB_PORT}")
    if 'neon.tech' in host or 'render.com' in host:
        problems.append('refusing a hosted production hostname')

    if problems:
        raise CommandError(f'Refusing {action}: ' + '; '.join(problems))
