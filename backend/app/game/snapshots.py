"""Export normalized state only: raw payloads can contain platform identifiers."""
import json
from dataclasses import asdict
from pathlib import Path
from .parser import parse_state


def capture(raw, destination):
    state = asdict(parse_state(raw))
    # Deliberately discard free-form names/character text from diagnostic exports.
    for p in state['players']:
        p['character_id'] = None
        p['display_name'] = None
        p['player_id'] = None
    path = Path(destination)
    with path.open('x', encoding='utf-8') as stream:
        json.dump({'format': 'normalized-diagnostic-v1', 'state': state}, stream, indent=2)
        stream.write('\n')
