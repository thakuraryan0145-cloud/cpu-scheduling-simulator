from django.urls import path
from .views import (
    CompareAlgorithmsView,
    SimulationDetailView,
    SimulationListCreateView,
    SimulationPdfView,
    UserDashboardView,
)

urlpatterns = [
    path('simulations/', SimulationListCreateView.as_view(), name='sim-list-create'),
    path('simulations/compare/', CompareAlgorithmsView.as_view(), name='sim-compare'),
    path('simulations/<int:pk>/', SimulationDetailView.as_view(), name='sim-detail'),
    path('simulations/<int:pk>/pdf/', SimulationPdfView.as_view(), name='sim-pdf'),
    path('dashboard/', UserDashboardView.as_view(), name='user-dashboard'),
]
