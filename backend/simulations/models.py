from django.conf import settings
from django.db import models


class Simulation(models.Model):
    """Saved CPU scheduling simulation run owned by a user."""

    ALGORITHM_CHOICES = [
        ('FCFS', 'First Come First Serve'),
        ('SJF', 'Shortest Job First'),
        ('SRTF', 'Shortest Remaining Time First'),
        ('PRIORITY_NP', 'Priority (Non-Preemptive)'),
        ('PRIORITY_P', 'Priority (Preemptive)'),
        ('RR', 'Round Robin'),
        ('HRRN', 'Highest Response Ratio Next'),
        ('MLQ', 'Multilevel Queue'),
        ('MLFQ', 'Multilevel Feedback Queue'),
        ('LOTTERY', 'Lottery Scheduling'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='simulations')
    name = models.CharField(max_length=120)
    algorithm = models.CharField(max_length=32, choices=ALGORITHM_CHOICES)
    quantum = models.PositiveIntegerField(default=2)
    aging = models.BooleanField(default=False)
    aging_interval = models.PositiveIntegerField(default=4)
    starvation_threshold = models.PositiveIntegerField(default=10)

    avg_wt = models.FloatField()
    avg_tat = models.FloatField()
    avg_rt = models.FloatField()
    cpu_util = models.FloatField()
    throughput = models.FloatField()
    makespan = models.PositiveIntegerField(default=0)
    context_switches = models.PositiveIntegerField(default=0)
    starved_count = models.PositiveIntegerField(default=0)

    gantt_data = models.JSONField(default=list)
    options_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} [{self.algorithm}] - {self.user.username}'


class SimulationProcess(models.Model):
    """Individual process input & computed metrics for a saved simulation."""

    simulation = models.ForeignKey(Simulation, on_delete=models.CASCADE, related_name='processes')
    pid = models.CharField(max_length=16)
    color = models.CharField(max_length=16, default='#6c8cff')
    arrival_time = models.PositiveIntegerField()
    burst_time = models.PositiveIntegerField()
    priority = models.PositiveIntegerField(default=1)
    io_at = models.PositiveIntegerField(default=0)
    io_time = models.PositiveIntegerField(default=0)

    start_time = models.IntegerField(null=True, blank=True)
    completion_time = models.IntegerField()
    turnaround_time = models.IntegerField()
    waiting_time = models.IntegerField()
    response_time = models.IntegerField()
    final_priority = models.IntegerField(default=1)
    max_wait = models.IntegerField(default=0)
    starved = models.BooleanField(default=False)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.pid} (AT={self.arrival_time}, BT={self.burst_time})'
