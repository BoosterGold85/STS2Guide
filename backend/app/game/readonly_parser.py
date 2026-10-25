"""Adapter for our own prototype schema, never an assumed third-party contract."""
from datetime import datetime
from .models import PlayerState, RunState
from .parser import ParseError, obj, number

SCHEMA = 'run-coach-readonly-v1'
BRIDGE_ID = 'RunCoach.ReadOnly'
BRIDGE_VERSION = '0.0.1-prototype'
SUPPORTED_BRIDGE_VERSIONS = frozenset({BRIDGE_VERSION, '0.1.0-preview'})


def text(data, key):
    value = data.get(key)
    if value is not None and not isinstance(value, str):
        raise ParseError(f'{key} must be text or null')
    return value


def parse_readonly(raw):
    obj(raw, 'state')
    if raw.get('schema') != SCHEMA or raw.get('bridge_id') != BRIDGE_ID:
        raise ParseError('Unsupported read-only bridge identity/schema')
    if raw.get('bridge_version') not in SUPPORTED_BRIDGE_VERSIONS or raw.get('status') != 'ok':
        raise ParseError('Unsupported bridge version or unavailable game state')
    active = raw.get('active')
    multi = raw.get('is_multiplayer')
    if type(active) is not bool or (multi is not None and type(multi) is not bool):
        raise ParseError('Invalid run flags')
    roster = raw.get('players')
    if not isinstance(roster, list):
        raise ParseError('players must be an array')
    if active and (not roster or multi is None):
        raise ParseError('Active state requires players and explicit game mode')
    if not active and roster:
        raise ParseError('Inactive state must not contain stale players')
    if multi is False and len(roster) > 1:
        raise ParseError('Single-player state contains multiple players')
    players = []
    for slot, entry in enumerate(roster):
        obj(entry, 'player')
        if number(entry, 'slot') != slot:
            raise ParseError('Roster slots must be contiguous and ordered')
        hp, maximum = number(entry, 'current_hp'), number(entry, 'max_hp')
        if hp is not None and maximum is not None and hp > maximum:
            raise ParseError('HP exceeds maximum')
        players.append(PlayerState(slot, text(entry, 'character'), hp, maximum,
                                   number(entry, 'gold'), number(entry, 'deck_count'),
                                   number(entry, 'relic_count'), number(entry, 'potion_count')))
    stamp = text(raw, 'timestamp')
    try:
        if not stamp or datetime.fromisoformat(stamp).tzinfo is None:
            raise ValueError()
    except ValueError as exc:
        raise ParseError('timestamp must be timezone-aware ISO 8601') from exc
    return RunState(active, multi, number(raw, 'act'), number(raw, 'floor'),
                    number(raw, 'ascension'), text(raw, 'current_room_type'), tuple(players),
                    stamp, text(raw, 'game_version'), raw['bridge_version'],
                    ('Prototype: installed-game compatibility and host/client behavior unverified.',
                     'Game version, stable player IDs, and display names unavailable.'))
