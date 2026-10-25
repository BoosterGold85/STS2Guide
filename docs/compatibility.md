# M0 compatibility report

## Evidence

Inspected upstream main SHA: 55e064850a68f3b4cde7e5fd525bf9b2dec4e885.
Source constant and manifest: STS2MCP 0.4.0. This is source inspection, not a tested
installed release. User-reported game screenshot: v0.107.1 (2026.06.18); not tested here. Python tested: 3.12.14.
Fixtures are synthetic, based on inspected field assignments, not captured live runs.

## HTTP policy

Only `GET /` is enabled (health greeting). Redirects, POST, and all other paths are
blocked before dispatch. Proxy environment configuration is ignored for loopback.
No local API or bridge is exposed to the LAN. Audit logger: `app.game.client`.

Blocked state routes: `/api/v1/singleplayer`, `/api/v1/multiplayer`.
`McpMod.StateBuilder.cs`: BuildGameState opens merchant inventory;
BuildShopState can ForceClick the merchant button; BuildTreasureState ForceClicks
an enabled chest. `McpMod.MultiplayerState.cs` opens inventory and delegates to
the same treasure builder. An HTTP 409 selects SP/MP upstream, but probing these
state routes is deliberately not implemented because successful reads can mutate state.

## Fields

Source-derived SP fields: run.act, run.floor, run.ascension; player.character,
hp, max_hp, gold, relics, potions. Live BuildPlayerState does not expose deck;
deck counts remain null for every player.
Source-derived MP fields: game_mode, net_type, player_count, local_player_slot,
players[].character/is_local/hp/max_hp/gold; local relics/potions in player (no deck).
No reliable stable player ID or display name is exposed here. Character is a localized
title, not a stable canonical ID. Slot is observation-local, not a persistent identity.
Remote deck/relic/potion counts remain null. Versions are not inferred from payload
fields that the inspected contract does not expose. Visible state_type is not physical
room type, so normalized room stays null unless room_type is actually supplied.
Unknown optional fields are tolerated and logged at DEBUG. Malformed known fields fail.
Overlay/unknown/error payloads without run metadata have unknown activity, not inactive.

None of these fields has been certified reliable in a real SP or MP session.
For future routing: full map DAG, current node, boss, stable run/player IDs, seed,
physical room, remote inventories and version metadata still need validation.

## Remaining gate

Obtain an audited side-effect-free bridge state interface without modifying game files
as part of this task. Record installed game/bridge versions. Then capture sanitized raw
fixtures and test the host/client matrix. Do not enable routes merely because their HTTP
method is GET or their version string matches. M0 is not accepted; M1 has not started.


## Separate read-only prototype

`bridge/RunCoach.ReadOnly` implements our own cached snapshot protocol, not STS2MCP.
Only main-thread property sampling is game-facing; the HTTP server has no game references.
It includes neither upstream UI state builders nor action dispatch. It uses port 15527.
GameReader now compiles against uploaded installed `sts2.dll`/`GodotSharp.dll`
with zero warnings and errors. The compiler caught a Godot/System.Environment name
collision, now fixed. A local-test mod ZIP is built; no game DLLs are bundled.
Assembly metadata confirmed Player.Deck and CardPile.Cards; per-player deck counts
now use this read-only collection API. No game assembly was executed in the cloud.

The separate HTTP server compiled under .NET SDK 9.0.319 and passed 17 real localhost
protocol checks, including stale snapshot refusal and subsequent recovery. The Python
suite passed 23 tests. The new schema fixture is synthetic and defined by our own source.
Subsequently, the user supplied one live SP snapshot (see below). Host/client behavior
and repeated live refresh remain unverified.

The Python console requires explicit `--readonly-bridge` to request the new state path
and checks the prototype identity/schema/version before doing so. Legacy state paths
remain denied in both clients. Identity checking prevents accidental client mismatch;
it is not cryptographic authentication or proof of installed-game compatibility.

## User-confirmed local results

Bridge loading and health succeeded on the user's PC. Enabling mods showed separate
progress; removing our two files restored the normal save. The game's profile path
provider confirms separate `modded/profile*` paths. See save-profiles.md. The bridge
manifest does not opt out of this behavior. Full live-state/co-op acceptance is still pending.

## First real single-player snapshot

The user pasted a live RunCoach.ReadOnly 0.0.1-prototype snapshot from game v0.107.1
(screenshot evidence), timestamp 2026-10-24T23:39:09.5757262+00:00. Saved verbatim as
tests/fixtures/live_sp_v01071_act1_start.json; its regression test passes.
It reports active=true, multiplayer=false, act=1, floor=0, ascension=0, MapRoom,
IRONCLAD, HP 80/80, gold 99, deck 10, relics 1, potions 0.
These fields are present and parse correctly in this single observed SP state.
They have not yet been cross-checked after a room/resource change.
Game version remains null in the payload. No recommendations are enabled.
Next required local evidence: a second changed snapshot without restarting the game,
then clean disconnect/reconnect and the co-op host/client acceptance matrix.

A second user-supplied live SP snapshot at 2026-10-24T23:40:18.7275359+00:00 reports
floor 1 / CombatRoom after floor 0 / MapRoom, following the no-restart refresh check.
Saved as live_sp_v01071_act1_combat.json. The room/floor transition and advancing
timestamp are observed; player resources stayed unchanged. Resource changes,
menu/inactive transition, disconnect/reconnect, and co-op are still unverified live.

A third user-pasted live SP snapshot at 2026-10-24T23:41:20.2262579+00:00 reports
68/80 HP (previously 80/80), still floor 1 / CombatRoom, with gold/inventory unchanged.
HP refresh is observed in the bridge payload; matching the game UI remains a manual
check. Combat completion and reward collection cannot be inferred from this payload.
Gold/inventory changes, menu transition, reconnect, and co-op remain unverified live.

The user explicitly confirmed that the prior 68 HP reading matched the game UI.
The subsequent live response at 2026-10-24T23:44:00.7411892+00:00 reports gold
99 -> 117 and deck count 10 -> 11, with HP still 68. Saved as a fourth real fixture.
CombatRoom remains the room class after the reward check; it must not be interpreted
as an active-combat flag. Relic/potion count changes, no-active-run behavior, game
restart/reconnect, and co-op host/client behavior remain unverified live.

Restart check: user supplied a connection-refused screenshot after closing the game,
then a fresh valid snapshot after relaunch/resume (23:45:50.8388166+00:00). This
confirms browser/API connectivity returns after game restart, not live Python-helper
recovery (the helper was not running on the user's PC). HP stays 68 but gold/deck
revert from 117/11 to 99/10. Saved-checkpoint restoration is a possible explanation;
in-game comparison is required before concluding it is expected or a bridge defect.
The parser preserves this new snapshot instead of retaining older resource values.

The user confirmed the resumed game's UI also showed 99 gold and 10 cards; the
post-restart payload matched the game, supporting checkpoint restoration rather than
misreading by the bridge. A subsequent live snapshot (23:47:12.4261179+00:00) reports
active=false, empty players, and null run fields. The inactive/menu transition is
observed and regression-tested. Co-op remains unverified and deferred by the user;
it must not be marked passed. M0 is not fully accepted. The live Python CLI on the
user's PC, game-version discovery, and host/client differences remain outstanding.

## Single-player route preview (user-authorized scope extension)

The user explicitly requested the single-player coach with co-op deferred. Preview
0.1.0 now includes a separate read-only MapReader, embedded browser dashboard and
pure deterministic route engine. It compiles against the uploaded game assembly.
Advice requires that assembly's MVID (97f10687-c306-4798-ab75-8b9f23f34dfb), valid
graph data, visible selectable map nodes, and single-player mode. An assembly match
is a compatibility guard, not proof of route quality. Co-op advice is disabled.
Automated fixture/browser tests pass; actual map capture and route selection must
still be checked in the running game. The prior SP fixtures do not contain maps.
