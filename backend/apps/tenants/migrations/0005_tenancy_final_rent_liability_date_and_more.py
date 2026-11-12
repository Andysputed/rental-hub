from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0004_tenant_unique_tenant_phone'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='tenancy',
            name='final_rent_liability_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenancy',
            name='notice_exception_authorized',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='tenancy',
            name='notice_exception_authorized_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='authorized_tenancy_notice_exceptions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='tenancy',
            name='notice_exception_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='tenancy',
            name='notice_expiry_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenancy',
            name='notice_received_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
