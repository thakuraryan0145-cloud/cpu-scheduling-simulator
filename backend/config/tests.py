from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class HealthCheckTests(TestCase):
    def test_health_endpoint_returns_ok(self):
        client = APIClient()
        response = client.get(reverse('api-health'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ok')
        self.assertIn(response.data['database'], ('sqlite', 'postgresql'))
