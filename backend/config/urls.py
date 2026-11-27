from django.contrib import admin
from django.db import connection
from django.http import FileResponse, Http404
from django.urls import include, path
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Verify API and database connectivity."""
    db_vendor = connection.vendor
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    return Response({
        'status': 'ok',
        'database': db_vendor,
        'version': '1.0.0',
    })


def serve_frontend_file(filename):
    """Serve root HTML/static assets directly so existing relative paths work seamlessly."""
    def _view(request):
        target = settings.PROJECT_ROOT / filename
        if not target.is_file():
            raise Http404(f'{filename} not found')
        return FileResponse(open(target, 'rb'), content_type='text/html; charset=utf-8')
    return _view


def serve_static_subpath(folder):
    """Serve css/* and js/* files directly in both DEBUG and local runs."""
    import mimetypes

    def _view(request, subpath):
        base = (settings.PROJECT_ROOT / folder).resolve()
        target = (base / subpath).resolve()
        if not str(target).startswith(str(base)) or not target.is_file():
            raise Http404('Asset not found')
        ctype, _ = mimetypes.guess_type(str(target))
        return FileResponse(open(target, 'rb'), content_type=ctype or 'application/octet-stream')
    return _view


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='api-health'),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('simulations.urls')),
    path('', serve_frontend_file('index.html'), name='frontend-index'),
    path('index.html', serve_frontend_file('index.html'), name='frontend-index-html'),
    path('login.html', serve_frontend_file('login.html'), name='frontend-login'),
    path('css/<path:subpath>', serve_static_subpath('css'), name='frontend-css'),
    path('js/<path:subpath>', serve_static_subpath('js'), name='frontend-js'),
]
