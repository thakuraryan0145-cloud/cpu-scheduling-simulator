from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User


SAMPLE_PAYLOAD = {
    'name': 'OS Lab Run 1',
    'algorithm': 'HRRN',
    'quantum': 2,
    'aging': False,
    'aging_interval': 4,
    'starvation_threshold': 10,
    'processes': [
        {'pid': 'P1', 'arrival': 0, 'burst': 6, 'priority': 2},
        {'pid': 'P2', 'arrival': 1, 'burst': 4, 'priority': 1, 'ioAt': 2, 'ioTime': 2},
        {'pid': 'P3', 'arrival': 2, 'burst': 3, 'priority': 3},
    ],
}


class SimulationAndAdminApiTests(TestCase):
    def setUp(self):
        self.student1 = User.objects.create_user(
            username='s1', email='s1@u.edu', password='StrongPassword123!', role=User.Role.STUDENT
        )
        self.student2 = User.objects.create_user(
            username='s2', email='s2@u.edu', password='StrongPassword123!', role=User.Role.STUDENT
        )
        self.admin = User.objects.create_user(
            username='admin1', email='admin@u.edu', password='StrongPassword123!', role=User.Role.ADMIN
        )

    def test_simulation_crud_privacy_dashboard_and_pdf(self):
        c1 = APIClient()
        c1.force_authenticate(user=self.student1)

        # Create simulation
        create_res = c1.post(reverse('sim-list-create'), SAMPLE_PAYLOAD, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        sim_id = create_res.data['simulation']['id']
        self.assertEqual(len(create_res.data['simulation']['processes']), 3)

        # List own simulations
        list_res = c1.get(reverse('sim-list-create'))
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data['simulations']), 1)

        # Student 2 cannot access or delete Student 1's simulation
        c2 = APIClient()
        c2.force_authenticate(user=self.student2)
        self.assertEqual(c2.get(reverse('sim-detail', args=[sim_id])).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(c2.delete(reverse('sim-detail', args=[sim_id])).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(len(c2.get(reverse('sim-list-create')).data['simulations']), 0)

        # Dashboard returns real DB-computed stats
        dash_res = c1.get(reverse('user-dashboard'))
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dash_res.data['total_simulations'], 1)
        self.assertGreater(dash_res.data['avg_cpu_utilization'], 0)

        # PDF download returns valid PDF bytes
        pdf_res = c1.get(reverse('sim-pdf', args=[sim_id]))
        self.assertEqual(pdf_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf_res['Content-Type'], 'application/pdf')
        self.assertTrue(pdf_res.content.startswith(b'%PDF-'))

        # Delete own simulation
        del_res = c1.delete(reverse('sim-detail', args=[sim_id]))
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(c1.get(reverse('sim-list-create')).data['simulations']), 0)

    def test_compare_endpoint_returns_all_10_algorithms(self):
        client = APIClient()
        res = client.post(reverse('sim-compare'), {'processes': SAMPLE_PAYLOAD['processes']}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data['comparisons']), 10)

    def test_admin_endpoints_enforce_rbac_and_manage_users(self):
        c_student = APIClient()
        c_student.force_authenticate(user=self.student1)
        self.assertEqual(c_student.get(reverse('admin-stats')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(c_student.get(reverse('admin-users')).status_code, status.HTTP_403_FORBIDDEN)

        c_admin = APIClient()
        c_admin.force_authenticate(user=self.admin)
        stats_res = c_admin.get(reverse('admin-stats'))
        self.assertEqual(stats_res.status_code, status.HTTP_200_OK)
        self.assertEqual(stats_res.data['total_users'], 3)

        # Deactivate student1
        patch_res = c_admin.patch(reverse('admin-user-manage', args=[self.student1.id]), {'is_active': False}, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.student1.refresh_from_db()
        self.assertFalse(self.student1.is_active)

        # Admin cannot deactivate themselves
        self_deact = c_admin.patch(reverse('admin-user-manage', args=[self.admin.id]), {'is_active': False}, format='json')
        self.assertEqual(self_deact.status_code, status.HTTP_400_BAD_REQUEST)
