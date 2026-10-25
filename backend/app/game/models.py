"""Bridge-independent M0 output. None means unavailable, never zero."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PlayerState:
    slot: int
    character_id: str | None
    current_hp: int | None
    max_hp: int | None
    gold: int | None
    deck_count: int | None
    relic_count: int | None
    potion_count: int | None
    is_local: bool | None = None
    player_id: str | None = None
    display_name: str | None = None


@dataclass(frozen=True)
class RunState:
    active: bool | None
    is_multiplayer: bool | None
    act: int | None
    floor: int | None
    ascension: int | None
    current_room_type: str | None
    players: tuple[PlayerState, ...]
    timestamp: str
    game_version: str | None = None
    bridge_version: str | None = None
    warnings: tuple[str, ...] = ()
