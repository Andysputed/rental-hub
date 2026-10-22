from rest_framework import viewsets, status
from rest_framework.response import Response
from .models import Expense
from .serializers import ExpenseSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        qs = Expense.objects.all().select_related('property')

        category = self.request.query_params.get('category')
        if category in ('maintenance', 'utilities', 'cleaning'):
            qs = qs.filter(category=category)

        month = self.request.query_params.get('month')
        if month:
            # month in YYYY-MM format
            try:
                year, month_num = month.split('-')
                qs = qs.filter(date__year=year, date__month=month_num)
            except ValueError:
                pass

        start_date = self.request.query_params.get('startDate')
        end_date = self.request.query_params.get('endDate')
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        return qs.order_by('-date', '-created_at')
