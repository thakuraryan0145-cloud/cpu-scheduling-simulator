from django.db import transaction
from rest_framework import serializers
from .engine import ALGORITHMS, simulate
from .models import Simulation, SimulationProcess


class SimulationProcessInputSerializer(serializers.Serializer):
    pid = serializers.CharField(max_length=16)
    color = serializers.CharField(max_length=16, required=False, default='#6c8cff')
    arrival = serializers.IntegerField(min_value=0, max_value=1000)
    burst = serializers.IntegerField(min_value=1, max_value=500)
    priority = serializers.IntegerField(min_value=0, max_value=100, required=False, default=1)
    ioAt = serializers.IntegerField(min_value=0, max_value=500, required=False, default=0)
    ioTime = serializers.IntegerField(min_value=0, max_value=500, required=False, default=0)

    def validate(self, attrs):
        if attrs.get('ioAt', 0) > 0:
            if attrs['ioAt'] >= attrs['burst']:
                raise serializers.ValidationError('ioAt must be less than burst time.')
            if attrs.get('ioTime', 0) < 1:
                raise serializers.ValidationError('ioTime must be >= 1 when ioAt > 0.')
        else:
            attrs['ioTime'] = 0
        return attrs


class SimulationProcessSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationProcess
        fields = (
            'id', 'pid', 'color', 'arrival_time', 'burst_time', 'priority',
            'io_at', 'io_time', 'start_time', 'completion_time',
            'turnaround_time', 'waiting_time', 'response_time',
            'final_priority', 'max_wait', 'starved',
        )


class SimulationListSerializer(serializers.ModelSerializer):
    process_count = serializers.IntegerField(source='processes.count', read_only=True)

    class Meta:
        model = Simulation
        fields = (
            'id', 'name', 'algorithm', 'quantum', 'aging', 'avg_wt', 'avg_tat',
            'avg_rt', 'cpu_util', 'throughput', 'makespan', 'context_switches',
            'starved_count', 'process_count', 'created_at',
        )


class SimulationDetailSerializer(serializers.ModelSerializer):
    processes = SimulationProcessSerializer(many=True, read_only=True)

    class Meta:
        model = Simulation
        fields = (
            'id', 'name', 'algorithm', 'quantum', 'aging', 'aging_interval',
            'starvation_threshold', 'avg_wt', 'avg_tat', 'avg_rt', 'cpu_util',
            'throughput', 'makespan', 'context_switches', 'starved_count',
            'gantt_data', 'options_data', 'processes', 'created_at',
        )


class SimulationCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    algorithm = serializers.ChoiceField(choices=list(ALGORITHMS.keys()))
    quantum = serializers.IntegerField(min_value=1, max_value=100, required=False, default=2)
    aging = serializers.BooleanField(required=False, default=False)
    aging_interval = serializers.IntegerField(min_value=1, max_value=200, required=False, default=4)
    starvation_threshold = serializers.IntegerField(min_value=1, max_value=1000, required=False, default=10)
    seed = serializers.IntegerField(required=False, default=42)
    processes = SimulationProcessInputSerializer(many=True, min_length=1, max_length=25)

    def create(self, validated_data):
        user = self.context['request'].user
        algo_id = validated_data['algorithm']
        procs_in = validated_data['processes']
        opts = {
            'quantum': validated_data['quantum'],
            'aging': validated_data['aging'],
            'agingInterval': validated_data['aging_interval'],
            'starvationThreshold': validated_data['starvation_threshold'],
            'seed': validated_data['seed'],
        }
        sim_out = simulate(procs_in, algo_id, opts)
        metrics = sim_out['metrics']
        name = (validated_data.get('name') or '').strip() or f"{ALGORITHMS[algo_id]['name']} ({len(procs_in)} procs)"

        with transaction.atomic():
            sim = Simulation.objects.create(
                user=user,
                name=name,
                algorithm=algo_id,
                quantum=opts['quantum'],
                aging=opts['aging'],
                aging_interval=opts['agingInterval'],
                starvation_threshold=opts['starvationThreshold'],
                avg_wt=round(metrics['avgWT'], 4),
                avg_tat=round(metrics['avgTAT'], 4),
                avg_rt=round(metrics['avgRT'], 4),
                cpu_util=round(metrics['cpuUtil'], 4),
                throughput=round(metrics['throughput'], 6),
                makespan=metrics['makespan'],
                context_switches=metrics['contextSwitches'],
                starved_count=metrics['starvedCount'],
                gantt_data=sim_out['gantt'],
                options_data=opts,
            )
            in_map = {p['pid']: p for p in procs_in}
            SimulationProcess.objects.bulk_create([
                SimulationProcess(
                    simulation=sim,
                    pid=r['pid'],
                    color=r['color'],
                    arrival_time=r['arrival'],
                    burst_time=r['burst'],
                    priority=r['priority'],
                    io_at=in_map.get(r['pid'], {}).get('ioAt', 0),
                    io_time=r['ioTime'],
                    start_time=r['start'],
                    completion_time=r['completion'],
                    turnaround_time=r['tat'],
                    waiting_time=r['wt'],
                    response_time=r['rt'],
                    final_priority=r['finalPriority'],
                    max_wait=r['maxWait'],
                    starved=r['starved'],
                )
                for r in sim_out['results']
            ])
        return sim
