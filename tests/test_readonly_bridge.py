import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from app.game.client import ReadOnlyBridgeClient, UnsafeEndpoint
from app.game.parser import parse_state, ParseError

FIXTURE = Path(__file__).parent / 'fixtures' / 'readonly_coop_prototype.json'


class ReadOnlyParserTests(unittest.TestCase):
    def setUp(self):
        self.raw = json.loads(FIXTURE.read_text())

    def test_two_players_with_remote_counts(self):
        state = parse_state(self.raw)
        self.assertTrue(state.active)
        self.assertTrue(state.is_multiplayer)
        self.assertEqual(state.players[1].potion_count, 1)
        self.assertEqual(state.players[1].relic_count, 1)
        self.assertEqual(state.players[1].deck_count, 10)
        self.assertEqual(state.current_room_type, 'MapRoom')
        self.assertIsNone(state.game_version)
        self.assertIn('unverified', state.warnings[0])

    def test_menu(self):
        self.raw.update(active=False, is_multiplayer=None, players=[], act=None,
                        floor=None, ascension=None, current_room_type=None)
        state = parse_state(self.raw)
        self.assertFalse(state.active)
        self.assertEqual(state.players, ())

    def test_unknown_optional_tolerated(self):
        self.raw['future_optional'] = True
        self.assertEqual(len(parse_state(self.raw).players), 2)

    def test_invalid_contract_rejected(self):
        for key, value in [('schema', 'unknown'), ('bridge_id', 'STS2MCP'),
                           ('bridge_version', 'new-version'), ('active', 1),
                           ('timestamp', '2026-01-01'), ('status', 'unavailable'),
                           ('is_multiplayer', 'yes'), ('players', [])]:
            raw = copy.deepcopy(self.raw)
            raw[key] = value
            with self.subTest(key=key), self.assertRaises(ParseError):
                parse_state(raw)

    def test_slots_and_hp_rejected(self):
        for key, value in [('slot', 7), ('current_hp', 1000), ('gold', True)]:
            raw = copy.deepcopy(self.raw)
            raw['players'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ParseError):
                parse_state(raw)

    def test_stale_roster_rejected(self):
        self.raw['active'] = False
        with self.assertRaises(ParseError):
            parse_state(self.raw)


class ReadOnlyClientTests(unittest.TestCase):
    def test_identity_gate_before_state_request(self):
        client = ReadOnlyBridgeClient()
        with patch.object(client, 'request', return_value={'status':'ok'}) as request:
            with self.assertRaises(UnsafeEndpoint):
                client.state()
            request.assert_called_once_with('GET', '/')

    def test_dedicated_state_route(self):
        raw = json.loads(FIXTURE.read_text())
        health = {key: raw[key] for key in ('bridge_id', 'bridge_version', 'schema')}
        health['status'] = 'ok'
        client = ReadOnlyBridgeClient()
        with patch.object(client, 'request', side_effect=[health, raw]) as request:
            state = parse_state(client.state())
            self.assertEqual(len(state.players), 2)
            self.assertEqual(request.call_args_list[1].args, ('GET', '/coach/v1/state'))

    def test_old_state_routes_still_blocked(self):
        client = ReadOnlyBridgeClient()
        with patch.object(client.opener, 'open') as network:
            for method, path in [('GET', '/api/v1/singleplayer'),
                                 ('GET', '/api/v1/multiplayer'),
                                 ('POST', '/coach/v1/state')]:
                with self.assertRaises(UnsafeEndpoint):
                    client.request(method, path)
            network.assert_not_called()


class LiveSinglePlayerRegressionTests(unittest.TestCase):
    def test_user_captured_v01071_snapshot(self):
        path = FIXTURE.parent / 'live_sp_v01071_act1_start.json'
        state = parse_state(json.loads(path.read_text()))
        self.assertTrue(state.active)
        self.assertFalse(state.is_multiplayer)
        self.assertEqual((state.act, state.floor, state.ascension), (1, 0, 0))
        self.assertEqual(state.current_room_type, 'MapRoom')
        self.assertEqual(len(state.players), 1)
        player = state.players[0]
        self.assertEqual(player.character_id, 'IRONCLAD')
        self.assertEqual((player.current_hp, player.max_hp, player.gold), (80, 80, 99))
        self.assertEqual((player.deck_count, player.relic_count, player.potion_count), (10, 1, 0))
        self.assertIsNone(state.game_version)
        self.assertEqual(state.timestamp, '2026-10-24T23:39:09.5757262+00:00')

    def test_user_captured_room_transition(self):
        initial = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_start.json').read_text()))
        combat = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_combat.json').read_text()))
        self.assertTrue(combat.active)
        self.assertFalse(combat.is_multiplayer)
        self.assertEqual((initial.floor, combat.floor), (0, 1))
        self.assertEqual((initial.current_room_type, combat.current_room_type), ('MapRoom', 'CombatRoom'))
        from datetime import datetime
        self.assertGreater(datetime.fromisoformat(combat.timestamp), datetime.fromisoformat(initial.timestamp))
        self.assertEqual(combat.players, initial.players)

    def test_user_captured_hp_change(self):
        from datetime import datetime
        before = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_combat.json').read_text()))
        after = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_hp68.json').read_text()))
        self.assertEqual((before.players[0].current_hp, after.players[0].current_hp), (80, 68))
        self.assertEqual(after.players[0].max_hp, 80)
        self.assertEqual(after.players[0].gold, 99)
        self.assertEqual((after.players[0].deck_count, after.players[0].relic_count, after.players[0].potion_count), (10, 1, 0))
        self.assertEqual((after.floor, after.current_room_type), (1, 'CombatRoom'))
        self.assertGreater(datetime.fromisoformat(after.timestamp), datetime.fromisoformat(before.timestamp))

    def test_user_captured_reward_resource_changes(self):
        from datetime import datetime
        before = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_hp68.json').read_text()))
        after = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_rewards.json').read_text()))
        self.assertEqual((before.players[0].gold, after.players[0].gold), (99, 117))
        self.assertEqual((before.players[0].deck_count, after.players[0].deck_count), (10, 11))
        self.assertEqual(after.players[0].current_hp, 68)
        self.assertEqual((after.players[0].relic_count, after.players[0].potion_count), (1, 0))
        self.assertEqual(after.current_room_type, 'CombatRoom')
        self.assertGreater(datetime.fromisoformat(after.timestamp), datetime.fromisoformat(before.timestamp))

    def test_user_captured_restart_does_not_retain_old_resources(self):
        from datetime import datetime
        previous = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_rewards.json').read_text()))
        resumed = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_resumed.json').read_text()))
        self.assertTrue(resumed.active)
        self.assertEqual((resumed.players[0].gold, resumed.players[0].deck_count), (99, 10))
        self.assertEqual((previous.players[0].gold, previous.players[0].deck_count), (117, 11))
        self.assertEqual(resumed.players[0].current_hp, 68)
        self.assertGreater(datetime.fromisoformat(resumed.timestamp), datetime.fromisoformat(previous.timestamp))

    def test_user_captured_inactive_state_clears_previous_run(self):
        previous = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_act1_resumed.json').read_text()))
        inactive = parse_state(json.loads((FIXTURE.parent / 'live_sp_v01071_inactive.json').read_text()))
        self.assertTrue(previous.active)
        self.assertFalse(inactive.active)
        self.assertEqual(inactive.players, ())
        self.assertIsNone(inactive.is_multiplayer)
        self.assertIsNone(inactive.act)
        self.assertIsNone(inactive.floor)
        self.assertIsNone(inactive.ascension)
        self.assertIsNone(inactive.current_room_type)


class PreviewDiagnosticCompatibilityTests(unittest.TestCase):
    def test_diagnostic_parser_and_client_accept_packaged_preview(self):
        raw = json.loads((FIXTURE.parents[1].parent / 'frontend' / 'demo.json').read_text())
        state = parse_state(raw)
        self.assertEqual(state.bridge_version, '0.1.0-preview')
        self.assertEqual(state.players[0].current_hp, 46)
        health = {key: raw[key] for key in ('bridge_id', 'bridge_version', 'schema')}
        health['status'] = 'ok'
        client = ReadOnlyBridgeClient()
        with patch.object(client, 'request', side_effect=[health, raw]):
            self.assertEqual(parse_state(client.state()).players[0].gold, 128)
