import json
import logging
import re
import uuid
from contextvars import ContextVar

request_id_context = ContextVar('rentalhub_request_id', default='-')
request_logger = logging.getLogger('rentalhub.request')


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = uuid.uuid4().hex
        token = request_id_context.set(request.request_id)
        try:
            response = self.get_response(request)
            response['X-Request-ID'] = request.request_id
            request_logger.info('request completed', extra={
                'method': request.method,
                'path': request.path,
                'status_code': response.status_code,
            })
            return response
        finally:
            request_id_context.reset(token)


class ContentSecurityPolicyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/admin/'):
            # Django admin currently includes inline scripts/styles; keep the
            # allowance limited to this staff-only route.
            policy = "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
        else:
            policy = "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
        response['Content-Security-Policy'] = policy
        response['Referrer-Policy'] = 'same-origin'
        response['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response


class JsonLogFormatter(logging.Formatter):
    SECRET_PATTERN = re.compile(r'(?i)(password|token|secret|authorization)(\s*[:=]\s*)[^\s,;]+')

    def format(self, record):
        payload = {
            'timestamp': self.formatTime(record, '%Y-%m-%dT%H:%M:%S'),
            'level': record.levelname,
            'logger': record.name,
            'request_id': request_id_context.get(),
            'message': self.SECRET_PATTERN.sub(r'\1\2[REDACTED]', record.getMessage()),
        }
        for field in ('method', 'path', 'status_code'):
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        # Deliberately omit exception text and stack locals from routine logs.
        return json.dumps(payload, ensure_ascii=False, default=str)


def csrf_failure(request, reason=''):
    from django.http import JsonResponse
    return JsonResponse(
        {'detail': 'CSRF verification failed.', 'requestId': getattr(request, 'request_id', None)},
        status=403,
    )
