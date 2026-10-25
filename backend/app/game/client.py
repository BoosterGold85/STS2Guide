"""Only the audited greeting endpoint is allowed. GET state has side effects."""
import json
import logging
import urllib.request
from urllib.error import URLError

log = logging.getLogger(__name__)
ALLOWED_REQUESTS = frozenset({('GET', '/')})
MAX_RESPONSE = 2_000_000


class BridgeError(Exception):
    pass


class UnsafeEndpoint(BridgeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise UnsafeEndpoint('Redirect refused')


class BridgeClient:
    allowed_requests = ALLOWED_REQUESTS

    def __init__(self, port=15526, timeout=2.0):
        if type(port) is not int or not 1 <= port <= 65535:
            raise ValueError('Invalid port')
        if timeout <= 0:
            raise ValueError('Timeout must be positive')
        self.base = f'http://127.0.0.1:{port}'
        self.timeout = timeout
        # Loopback traffic must not use ambient HTTP proxies.
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, method, path):
        if (method, path) not in self.allowed_requests:
            raise UnsafeEndpoint('Endpoint is not certified read-only')
        log.info('Bridge request %s %s', method, path)
        try:
            req = urllib.request.Request(self.base + path, method=method)
            with self.opener.open(req, timeout=self.timeout) as response:
                body = response.read(MAX_RESPONSE + 1)
                if len(body) > MAX_RESPONSE:
                    raise BridgeError('Bridge response exceeds size limit')
                value = json.loads(body)
                if not isinstance(value, dict):
                    raise BridgeError('Bridge response must be an object')
                return value
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            raise BridgeError(f'Bridge unavailable or invalid response ({type(exc).__name__})') from exc

    def health(self):
        result = self.request('GET', '/')
        if result.get('status') != 'ok':
            raise BridgeError('Bridge did not report healthy status')
        return result


class ReadOnlyBridgeClient(BridgeClient):
    """Opt-in client for the separately built RunCoach.ReadOnly prototype only."""
    allowed_requests = frozenset({('GET', '/'), ('GET', '/coach/v1/state')})

    def __init__(self, port=15527, timeout=2.0):
        super().__init__(port, timeout)

    def state(self):
        from .readonly_parser import BRIDGE_ID, SUPPORTED_BRIDGE_VERSIONS, SCHEMA
        health = self.health()
        if (health.get('bridge_id') != BRIDGE_ID or health.get('schema') != SCHEMA
                or health.get('bridge_version') not in SUPPORTED_BRIDGE_VERSIONS):
            raise UnsafeEndpoint('Unexpected bridge; refusing state request')
        return self.request('GET', '/coach/v1/state')
