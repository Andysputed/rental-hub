import re
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from django.conf import settings as django_settings
from apps.properties.services import get_active_property_id
from .models import Expense
from .serializers import ExpenseSerializer


class ExpenseViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        active_prop_id = get_active_property_id()
        qs = Expense.objects.all().select_related('property')
        if active_prop_id:
            qs = qs.filter(property_id=active_prop_id)

        category = self.request.query_params.get('category')
        if category in ('maintenance', 'utilities', 'cleaning'):
            qs = qs.filter(category=category)

        month = self.request.query_params.get('month')
        if month and re.match(r'^\d{4}-(0[1-9]|1[0-2])$', month):
            year, month_num = month.split('-')
            qs = qs.filter(date__year=int(year), date__month=int(month_num))

        start_date = self.request.query_params.get('startDate')
        end_date = self.request.query_params.get('endDate')
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        return qs.order_by('-date', '-created_at')
