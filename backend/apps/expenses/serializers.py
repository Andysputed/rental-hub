from decimal import Decimal
from rest_framework import serializers
from apps.properties.models import Property
from apps.properties.services import get_default_property
from django.conf import settings as django_settings
from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    propertyId = serializers.PrimaryKeyRelatedField(source='property', queryset=Property.objects.all(), required=False)
    propertyName = serializers.CharField(source='property.name', read_only=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))

    class Meta:
        model = Expense
        fields = [
            'id',
            'propertyId',
            'propertyName',
            'category',
            'title',
            'amount',
            'date',
            'method',
            'reference',
            'description',
            'created_at',
            'updated_at',
        ]

    def create(self, validated_data):
        if 'property' not in validated_data:
            validated_data['property'] = get_default_property()
        return super().create(validated_data)
