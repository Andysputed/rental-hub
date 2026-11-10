"""Settings for explicitly isolated local verification runs."""
import tempfile
from pathlib import Path
from .settings import *  # noqa: F403

DATABASES = {  # noqa: F405
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': str(Path(tempfile.gettempdir()) / 'rentalhub_adversarial_local.sqlite3'),
    }
}
