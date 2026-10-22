from django.urls import path
from .views import DashboardMetricsView, MonthlyReportView

urlpatterns = [
    path('dashboard/metrics/', DashboardMetricsView.as_view(), name='dashboard-metrics'),
    path('reports/monthly/', MonthlyReportView.as_view(), name='monthly-report'),
]
