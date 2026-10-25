import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from app.game.client import BridgeClient, BridgeError, UnsafeEndpoint
from app.game.parser import parse_state, ParseError
from app.game.snapshots import capture

FIXTURES = Path(__file__).parent / 'fixtures'


def fixture(name):
    return json.loads((FIXTURES / f'{name}.json').read_text())


class ParserTests(unittest.TestCase):
    def test_singleplayer(self):
        state = parse_state(fixture('sp_act1_start'))
        self.assertTrue(state.active)
        self.assertFalse(state.is_multiplayer)
        self.assertEqual((state.act, state.floor), (1, 0))
        self.assertEqual(state.players[0].current_hp, 80)
        self.assertIsNone(state.players[0].deck_count)
        self.assertIsNone(state.game_version)
        self.assertIsNone(state.current_room_type)

    def test_coop(self):
        state = parse_state(fixture('coop_act1_healthy'))
        self.assertTrue(state.is_multiplayer)
        self.assertEqual(len(state.players), 2)
        self.assertEqual(state.players[1].current_hp, 63)
        self.assertIsNone(state.players[0].deck_count)
        self.assertIsNone(state.players[1].deck_count)
        self.assertIsNone(state.players[1].player_id)

    def test_client_local_slot(self):
        raw = fixture('coop_act1_healthy')
        raw['local_player_slot'] = 1
        raw['player'] = {'character': 'Silent', 'hp': 62, 'max_hp': 70, 'relics': [{'id': 'TEST'}]}
        state = parse_state(raw)
        self.assertIsNone(state.players[0].deck_count)
        self.assertEqual(state.players[1].relic_count, 1)

    def test_menu(self):
        state = parse_state(fixture('no_active_run'))
        self.assertFalse(state.active)
        self.assertEqual(state.players, ())
        self.assertIsNone(state.is_multiplayer)

    def test_unknown_field(self):
        raw = fixture('sp_act1_start')
        raw['future_optional'] = {'x': 1}
        self.assertTrue(parse_state(raw).active)

    def test_overlay_not_assumed_inactive(self):
        self.assertIsNone(parse_state({'state_type': 'ftue'}).active)

    def test_invalid_shapes(self):
        cases = [None, {}, {'state_type': 3}]
        for key, value in [('hp', True), ('gold', -1), ('relics', 'bad')]:
            raw = fixture('sp_act1_start')
            raw['player'][key] = value
            cases.append(raw)
        for raw in cases:
            with self.subTest(raw=raw), self.assertRaises(ParseError):
                parse_state(raw)

    def test_partial_roster_rejected(self):
        raw = fixture('coop_act1_healthy')
        raw['players'].pop()
        with self.assertRaises(ParseError):
            parse_state(raw)

    def test_capture_sanitized_and_no_overwrite(self):
        raw = fixture('sp_act1_start')
        raw['machine_secret'] = 'sensitive'
        raw['player']['character'] = 'private name'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.json'
            capture(raw, path)
            text = path.read_text()
            self.assertNotIn('sensitive', text)
            self.assertNotIn('private name', text)
            self.assertEqual(json.loads(text)['state']['players'][0]['current_hp'], 80)
            with self.assertRaises(FileExistsError):
                capture(raw, path)


class Handler(BaseHTTPRequestHandler):
    paths = []
    mode = 'healthy'

    def log_message(self, *args):
        pass

    def do_GET(self):
        type(self).paths.append(self.path)
        if type(self).mode == 'redirect':
            self.send_response(302)
            self.send_header('Location', '/api/v1/singleplayer')
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok","message":"Hello from STS2 MCP v0.4.0"}')


class ClientTests(unittest.TestCase):
    def setUp(self):
        Handler.paths = []
        Handler.mode = 'healthy'
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.client = BridgeClient(self.server.server_port, timeout=0.2)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_health_repeated(self):
        for _ in range(3):
            self.assertEqual(self.client.health()['status'], 'ok')
        self.assertEqual(Handler.paths, ['/', '/', '/'])

    def test_state_and_actions_blocked_before_network(self):
        for method, path in [('GET', '/api/v1/singleplayer'), ('GET', '/api/v1/multiplayer'),
                             ('POST', '/'), ('POST', '/api/v1/singleplayer'),
                             ('GET', '//example.com'), ('GET', '/?action=anything')]:
            with self.subTest(method=method, path=path), self.assertRaises(UnsafeEndpoint):
                self.client.request(method, path)
        self.assertEqual(Handler.paths, [])

    def test_redirect_blocked(self):
        Handler.mode = 'redirect'
        with self.assertRaises(UnsafeEndpoint):
            self.client.health()
        self.assertEqual(Handler.paths, ['/'])

    def test_disconnect_recovery(self):
        with patch.object(self.client.opener, 'open', side_effect=ConnectionRefusedError):
            with self.assertRaises(BridgeError):
                self.client.health()
        self.assertEqual(self.client.health()['status'], 'ok')

    def test_bad_json(self):
        from io import BytesIO
        with patch.object(self.client.opener, 'open', return_value=BytesIO(b'not json')):
            with self.assertRaises(BridgeError):
                self.client.health()


if __name__ == '__main__':
    unittest.main()
