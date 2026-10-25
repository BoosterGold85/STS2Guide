# Changelog

## 0.0.1 prototype

- Added typed offline SP/co-op normalization, safe loopback health monitoring,
  sanitized diagnostic exports, and parser/transport regression tests.
- Blocked upstream state GET endpoints after source inspection found gameplay mutations.
- Live M0 acceptance remains pending; no recommendations or dashboard implemented.

- Added separate RunCoach.ReadOnly source prototype with cached main-thread snapshots,
  GET-only loopback server, stale-state rejection, source-only build helper, opt-in
  Python client/adapter, and nine additional Python plus 13 HTTP protocol checks.
- Game integration compilation remains blocked by absent installed-game reference DLLs.

- Compiled the full mod against uploaded game DLLs, fixed Godot/System.Environment
  ambiguity, and added deck counts after inspecting the actual assembly metadata.
- Packaged a local-test mod ZIP without game assemblies. Live validation remains pending.

- Replaced HttpListener with a bounded loopback TCP HTTP server to avoid Windows
  URL ACL/admin requirements; 17 protocol checks and a Python/C# fixture roundtrip pass.

- Confirmed the game uses separate ordinary/modded profile paths; documented the
  observed save return after removing the bridge. Updated the download instructions
  to warn before installation, with disposable-run testing and no save migration.
- User confirmed mod loading and health only; live-state/co-op acceptance still pending.

- Captured the first actual user-provided SP snapshot on game v0.107.1 and added a
  regression test for all reported M0 fields and the seven-digit fractional timestamp.
  Full refresh/reconnect/co-op acceptance remains outstanding; 24 Python tests pass.
- Added the second user-provided live SP fixture and transition regression: floor
  0/MapRoom -> floor 1/CombatRoom, timestamp advances. 25 Python tests pass.
- Added a third real SP fixture and regression for HP changing 80 -> 68 while
  preserving max HP and unchanged resource counts. 26 Python tests pass.
- Added real SP reward-state regression for gold 99 -> 117 and deck count 10 -> 11;
  user confirmed earlier 68 HP matches the game. 27 Python tests pass.
- Recorded a real restart/reconnect fixture. Gold/deck differ from the pre-restart
  reward snapshot (99/10 versus 117/11); cause awaits game-UI comparison.
  28 Python tests pass. Browser reconnect is observed; live helper recovery is untested.
- Added real inactive-state fixture: player/run fields clear when active=false.
  User confirmed resumed gold/deck match the game UI. 29 Python tests pass.

## 0.1.0 route-coach preview

- User authorized proceeding to a usable single-player coach with co-op tests deferred.
- Added read-only map graph and selectable-node observation adapted from uploaded STS2MCP.
- Embedded a browser dashboard, normalized adapter and deterministic route engine in
  the mod; no extra runtime installation on the gaming PC.
- Added Safe/Balanced/Aggressive routes, 4/6/8-room lookahead, highlighted paths,
  heuristic score explanations, assumptions, clear demo labeling and save-profile notice.
- Gate advice on the known game assembly, complete map, legal choices, and single-player;
  clear suggestions on disconnect/staleness. No original action endpoint is enabled.
- New live map capture/route advice still needs PC validation. No milestone is marked
  fully accepted, and score is not a survival probability.
