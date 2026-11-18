"""Delete every RentalHub business record in the isolated staging database."""

from django.core.management.base import BaseCommand

from apps.properties.staging_data import wipe_staging_data
from config.staging_guard import assert_staging


class Command(BaseCommand):
    help = (
        'Delete staging business data (rooms, tenancies, charges, payments, '
        'deposits, expenses). Refuses to run outside the staging database. '
        'Authentication users are kept.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--no-input', action='store_true', help='Skip the confirmation prompt.')

    def handle(self, *args, **options):
        assert_staging('reset staging data')

        if not options['no_input']:
            answer = input(
                'This deletes all staging business data (the database is local and '
                'dedicated to staging). Type "reset staging" to continue: '
            )
            if answer.strip() != 'reset staging':
                self.stdout.write(self.style.WARNING('Reset cancelled.'))
                return

        counts = wipe_staging_data()
        self.stdout.write(self.style.SUCCESS('Staging data reset.'))
        for model_name, deleted in counts.items():
            self.stdout.write(f'  {model_name}: {deleted}')
