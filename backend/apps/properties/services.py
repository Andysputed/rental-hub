from django.conf import settings as django_settings
from .models import Property


def get_default_property():
    """Read the explicitly configured property, falling back to the first available property in test/isolated environments."""
    configured_id = getattr(django_settings, 'RENTALHUB_PROPERTY_ID', None)
    if configured_id:
        prop = Property.objects.filter(pk=configured_id).first()
        if prop:
            return prop
    return Property.objects.order_by('id').first()


def get_active_property_id():
    """Return the ID of the active property."""
    prop = get_default_property()
    if prop:
        return prop.id
    return getattr(django_settings, 'RENTALHUB_PROPERTY_ID', 1)

