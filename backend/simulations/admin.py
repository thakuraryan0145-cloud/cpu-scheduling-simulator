from django.contrib import admin
from .models import Simulation, SimulationProcess


class SimulationProcessInline(admin.TabularInline):
    model = SimulationProcess
    extra = 0


@admin.register(Simulation)
class SimulationAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'algorithm', 'avg_wt', 'avg_tat', 'cpu_util', 'created_at')
    list_filter = ('algorithm', 'created_at')
    inlines = [SimulationProcessInline]
