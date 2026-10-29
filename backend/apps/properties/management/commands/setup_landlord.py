"""
Management command: setup_landlord

Creates the initial landlord superuser account for RentalHub.
Run this once after the first migration:

    python manage.py setup_landlord

Prompts for a username and password interactively, or reads from
environment variables LANDLORD_USERNAME and LANDLORD_PASSWORD for
non-interactive setups (e.g., Docker, CI).

Safe to re-run — skips creation if the user already exists.
"""

import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Create the initial landlord superuser account for RentalHub.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            default=None,
            help='Landlord username (default: read from LANDLORD_USERNAME env var, then prompt).',
        )
        parser.add_argument(
            '--password',
            default=None,
            help='Landlord password (default: read from LANDLORD_PASSWORD env var, then prompt).',
        )
        parser.add_argument(
            '--email',
            default='',
            help='Optional email address for the landlord account.',
        )
        parser.add_argument(
            '--noinput',
            action='store_true',
            help='Do not prompt; require --username and --password or env vars.',
        )

    def handle(self, *args, **options):
        username = (
            options['username']
            or os.environ.get('LANDLORD_USERNAME')
        )
        password = (
            options['password']
            or os.environ.get('LANDLORD_PASSWORD')
        )
        email = options.get('email', '')

        if not username:
            if options['noinput']:
                raise CommandError(
                    'Username required. Pass --username or set LANDLORD_USERNAME.'
                )
            username = input('Landlord username: ').strip()

        if not username:
            raise CommandError('Username must not be empty.')

        if not password:
            if options['noinput']:
                raise CommandError(
                    'Password required. Pass --password or set LANDLORD_PASSWORD.'
                )
            import getpass
            password = getpass.getpass('Landlord password: ')
            confirm = getpass.getpass('Confirm password: ')
            if password != confirm:
                raise CommandError('Passwords do not match.')

        if not password:
            raise CommandError('Password must not be empty.')

        if User.objects.filter(username=username).exists():
            self.stdout.write(
                self.style.WARNING(
                    f'User "{username}" already exists — no changes made.'
                )
            )
            return

        User.objects.create_superuser(
            username=username,
            password=password,
            email=email,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'Landlord account "{username}" created successfully. '
                'You can now log in at /api/v1/auth/login/'
            )
        )

