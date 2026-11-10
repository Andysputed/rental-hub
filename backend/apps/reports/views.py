import re
from datetime import date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from apps.properties.views import get_default_property
from .services import get_dashboard_metrics, get_monthly_financial_report


class DashboardMetricsView(APIView):
    def get(self, request):
        month = request.query_params.get('month')
        if not month:
            month = timezone.now().date().strftime('%Y-%m')
        elif not re.match(r'^\d{4}-(0[1-9]|1[0-2])$', month):
            return Response(
                {"error": "Invalid month format. Expected YYYY-MM (e.g. 2026-10)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        prop = get_default_property()
        if not prop:
            return Response({"detail": "Configured property is not initialized."}, status=status.HTTP_404_NOT_FOUND)
        data = get_dashboard_metrics(month=month, property_obj=prop)
        return Response(data, status=status.HTTP_200_OK)


class MonthlyReportView(APIView):
    def get(self, request):
        month = request.query_params.get('month')
        if not month:
            month = timezone.now().date().strftime('%Y-%m')
        elif not re.match(r'^\d{4}-(0[1-9]|1[0-2])$', month):
            return Response(
                {"error": "Invalid month format. Expected YYYY-MM (e.g. 2026-10)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        prop = get_default_property()
        if not prop:
            return Response({"detail": "Configured property is not initialized."}, status=status.HTTP_404_NOT_FOUND)
        data = get_monthly_financial_report(month=month, property_obj=prop)
        return Response(data, status=status.HTTP_200_OK)
