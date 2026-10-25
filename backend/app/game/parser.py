"""Adapter for inspected STS2MCP 0.4.0 source; not live-certified."""
import logging
from datetime import datetime, timezone
from .models import PlayerState, RunState

log = logging.getLogger(__name__)


class ParseError(ValueError):
    pass


def obj(value, label):
    if not isinstance(value, dict):
        raise ParseError(f'{label} must be an object')
    return value


def number(data, key):
    value = data.get(key)
    if value is not None and (type(value) is not int or value < 0):
        raise ParseError(f'{key} must be a nonnegative integer or null')
    return value


def count(data, key):
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, list):
        raise ParseError(f'{key} must be an array')
    # STS2MCP potion arrays contain occupied slots, not invented capacity.
    return len(value)


def player(data, slot):
    obj(data, 'player')
    character = data.get('character')
    if character is not None and not isinstance(character, str):
        raise ParseError('character must be text')
    local = data.get('is_local')
    if local is not None and type(local) is not bool:
        raise ParseError('is_local must be boolean')
    return PlayerState(slot, character, number(data, 'hp'), number(data, 'max_hp'),
                       number(data, 'gold'), None, count(data, 'relics'),
                       count(data, 'potions'), local)


def parse_state(raw):
    obj(raw, 'state')
    if 'schema' in raw:
        from .readonly_parser import parse_readonly
        return parse_readonly(raw)
    kind = raw.get('state_type')
    if not isinstance(kind, str):
        raise ParseError('state_type is missing or invalid')
    known = {'state_type', 'run', 'player', 'players', 'game_mode', 'net_type',
             'player_count', 'local_player_slot', 'menu_screen', 'message', 'map',
             'battle', 'event', 'shop', 'rest_site', 'treasure', 'room_type'}
    for key in raw.keys() - known:
        log.debug('Unmapped bridge field: %s', key)
    warnings = ['Source-derived schema; live compatibility unverified.',
                'Deck counts are unavailable in the inspected live player schema.']
    run = raw.get('run')
    active = False if kind == 'menu' else (True if isinstance(run, dict) else None)
    if active is None:
        warnings.append('Run activity unknown; overlay/error does not prove an inactive run.')
    if run is not None:
        obj(run, 'run')
    run = run or {}
    multiplayer = True if raw.get('game_mode') == 'multiplayer' else None
    players = []
    if multiplayer:
        roster = raw.get('players')
        if not isinstance(roster, list) or not roster:
            raise ParseError('Multiplayer state requires a nonempty players array')
        declared = number(raw, 'player_count')
        if declared is not None and declared != len(roster):
            raise ParseError('player_count disagrees with roster')
        local = raw.get('player')
        local_slot = number(raw, 'local_player_slot')
        if local_slot is not None and local_slot >= len(roster):
            raise ParseError('local_player_slot is outside roster')
        for slot, entry in enumerate(roster):
            entry = obj(entry, 'roster entry')
            # Only an explicit upstream local slot permits merging full inventory.
            merged = dict(entry)
            if slot == local_slot and local is not None:
                merged.update(obj(local, 'local player'))
            players.append(player(merged, slot))
        warnings.append('Remote inventories and stable player IDs are not exposed by this roster schema.')
    elif raw.get('player') is not None:
        multiplayer = False
        players.append(player(raw['player'], 0))
    if active and not players:
        raise ParseError('Active run has no player state')
    return RunState(active, multiplayer, number(run, 'act'), number(run, 'floor'),
                    number(run, 'ascension'), raw.get('room_type'), tuple(players),
                    datetime.now(timezone.utc).isoformat(), warnings=tuple(warnings + [
                        'state_type describes the visible screen; it is not a reliable room type.',
                        'Game version is not exposed by the inspected state contract.']))
