from django.db.models import Avg
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsOwnerOrAdmin
from .engine import ALGORITHMS, simulate
from .models import Simulation
from .pdf_report import generate_simulation_pdf
from .serializers import (
    SimulationCreateSerializer,
    SimulationDetailSerializer,
    SimulationListSerializer,
    SimulationProcessInputSerializer,
)


class SimulationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Simulation.objects.filter(user=request.user).prefetch_related('processes')
        serializer = SimulationListSerializer(qs, many=True)
        return Response({'simulations': serializer.data})

    def post(self, request):
        serializer = SimulationCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        sim = serializer.save()
        return Response(
            {
                'simulation': SimulationDetailSerializer(sim).data,
                'message': 'Simulation saved to history.',
            },
            status=status.HTTP_201_CREATED,
        )


class SimulationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def _get_obj(self, request, pk):
        obj = get_object_or_404(Simulation.objects.prefetch_related('processes'), pk=pk)
        self.check_object_permissions(request, obj)
        return obj

    def get(self, request, pk):
        sim = self._get_obj(request, pk)
        return Response({'simulation': SimulationDetailSerializer(sim).data})

    def delete(self, request, pk):
        sim = self._get_obj(request, pk)
        sim.delete()
        return Response({'message': 'Simulation deleted.'}, status=status.HTTP_200_OK)


class SimulationPdfView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request, pk):
        sim = get_object_or_404(Simulation.objects.prefetch_related('processes', 'user'), pk=pk)
        self.check_object_permissions(request, sim)
        pdf_bytes = generate_simulation_pdf(sim)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="simulation_{sim.id}_{sim.algorithm.lower()}.pdf"'
        return response


class CompareAlgorithmsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        proc_ser = SimulationProcessInputSerializer(data=request.data.get('processes', []), many=True)
        proc_ser.is_valid(raise_exception=True)
        if not proc_ser.validated_data:
            return Response({'detail': 'At least one process is required.'}, status=status.HTTP_400_BAD_REQUEST)

        opts = {
            'quantum': int(request.data.get('quantum', 2)),
            'aging': bool(request.data.get('aging', False)),
            'agingInterval': int(request.data.get('aging_interval', 4)),
            'starvationThreshold': int(request.data.get('starvation_threshold', 10)),
            'seed': int(request.data.get('seed', 42)),
        }
        runs = []
        for algo_id in ALGORITHMS:
            res = simulate(proc_ser.validated_data, algo_id, opts)
            runs.append({
                'algorithm': algo_id,
                'name': res['algo']['name'],
                'metrics': res['metrics'],
                'gantt': res['gantt'],
            })
        return Response({'comparisons': runs})


class UserDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Simulation.objects.filter(user=request.user)
        total = qs.count()
        agg = qs.aggregate(
            avg_wt=Avg('avg_wt'),
            avg_tat=Avg('avg_tat'),
            avg_cpu=Avg('cpu_util'),
        )
        algo_counts = {}
        for algo in qs.values_list('algorithm', flat=True):
            algo_counts[algo] = algo_counts.get(algo, 0) + 1
        recent_algos = [
            {'algorithm': k, 'count': v}
            for k, v in sorted(algo_counts.items(), key=lambda x: -x[1])
        ]
        recent_sims = SimulationListSerializer(qs.prefetch_related('processes')[:10], many=True).data
        return Response({
            'total_simulations': total,
            'avg_waiting_time': round(agg['avg_wt'] or 0.0, 2),
            'avg_turnaround_time': round(agg['avg_tat'] or 0.0, 2),
            'avg_cpu_utilization': round(agg['avg_cpu'] or 0.0, 2),
            'recent_algorithms': recent_algos,
            'recent_simulations': recent_sims,
        })
