from decimal import Decimal
from rest_framework import serializers
from apps.properties.models import Property
from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    propertyId = serializers.PrimaryKeyRelatedField(source='property', queryset=Property.objects.all(), required=False)
    propertyName = serializers.CharField(source='property.name', read_only=True)

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
            validated_data['property'] = Property.objects.first()
        return super().create(validated_data)
