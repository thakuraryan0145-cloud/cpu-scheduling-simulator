from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminRole
from accounts.serializers import UserSerializer
from simulations.models import Simulation


class AdminStatsView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        verified_users = User.objects.filter(is_verified=True).count()
        total_simulations = Simulation.objects.count()

        algo_stats = list(
            Simulation.objects.values('algorithm')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        recent_simulations = [
            {
                'id': s.id,
                'name': s.name,
                'algorithm': s.algorithm,
                'username': s.user.username,
                'avg_wt': round(s.avg_wt, 2),
                'cpu_util': round(s.cpu_util, 1),
                'created_at': s.created_at,
            }
            for s in Simulation.objects.select_related('user').order_by('-created_at')[:10]
        ]
        return Response({
            'total_users': total_users,
            'active_users': active_users,
            'verified_users': verified_users,
            'total_simulations': total_simulations,
            'algorithm_usage': algo_stats,
            'recent_activity': recent_simulations,
        })


class AdminUserListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        users = User.objects.annotate(simulation_count=Count('simulations')).order_by('-created_at')
        data = []
        for u in users:
            serialized = UserSerializer(u).data
            serialized['simulation_count'] = u.simulation_count
            data.append(serialized)
        return Response({'users': data})


class AdminUserManageView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if 'is_active' in request.data:
            new_active = bool(request.data['is_active'])
            if target.pk == request.user.pk and not new_active:
                return Response({'detail': 'You cannot deactivate your own admin account.'}, status=status.HTTP_400_BAD_REQUEST)
            target.is_active = new_active
        if 'role' in request.data:
            new_role = str(request.data['role']).upper()
            if new_role not in (User.Role.STUDENT, User.Role.ADMIN):
                return Response({'detail': 'Invalid role.'}, status=status.HTTP_400_BAD_REQUEST)
            target.role = new_role
        target.save()
        return Response({'user': UserSerializer(target).data, 'message': 'User updated successfully.'})
