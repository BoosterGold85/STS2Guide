# RunCoach.ReadOnly prototype

This is a separate prototype bridge, NOT an STS2MCP release or a live-certified mod.
The full mod compiled against the uploaded installed-game DLLs with zero warnings/errors.
The user confirmed mod loading and HTTP health. Live state reading remains unverified.
Loading mods switches the game to its separate modded save profile even though this
bridge does not write saves. Read ../docs/save-profiles.md before testing. The local-test ZIP contains
only our mod DLL and manifest, plus instructions/checksums; no game DLLs are redistributed.

## Design

The ProcessFrame callback observes simple run/player properties every 500 ms. It
serializes a snapshot on the main thread. The TCP loopback server avoids Windows HTTP.sys URL ACL/admin requirements.
It bounds request headers and read/write time, rejects unknown hosts and request bodies,
and closes each HTTP connection. The HTTP server never invokes game code;
it serves only the cached snapshot. Failed sampling replaces old state with an error,
and snapshots older than five seconds are refused. No UI builders, gameplay actions,
Harmony patches, file writes, system commands, or upstream automation files are included.

Endpoints on loopback port 15527:

- `GET /`: bridge identity and version.
- `GET /coach/v1/state`: cached observation, own schema `run-coach-readonly-v1`.
- `GET /coach`: embedded browser dashboard; `/assets/` serves an exact asset allowlist.
- All non-GET requests and unknown paths rejected; no CORS or redirects.
- Same-origin browser modules are allowed; cross-origin requests are refused.

`current_room_type` is the runtime class name, not a routing taxonomy. Character is
`Character.Id.Entry`; no display/platform names or stable player IDs are exported.
Deck counts use Player.Deck.Cards.Count(), confirmed present in the uploaded assembly
and compiled successfully. Game version remains null; assembly version 0.1.0.0 is not
the user-visible game build version.
HP, gold, relic and potion counts are sampled separately for every player in the run.
Reading APIs still requires validation on the actual game version; absence of explicit
commands is a source-level finding, not proof of every game property's implementation.

## Build without changing game files

Requires .NET 9 SDK and the installed game's `sts2.dll` and `GodotSharp.dll`.
From repo root in PowerShell: `./scripts/build-bridge.ps1`.
Or: `dotnet build bridge/RunCoach.ReadOnly/RunCoach.ReadOnly.csproj -p:GameDataDir="PATH"`.
The script reads the game folder and writes only repo-local `artifacts/`.
No automatic installation or SDK download on the user's PC is performed.
Future builds should use the exact installed-game references; changed APIs may need fixes.

No game assemblies are included in the project or downloadable source bundle.
To allow a cloud compile, provide copies of the two DLLs from
`data_sts2_windows_x86_64` and `release_info.json` from the game root. Keep originals
in place. Further assembly references might be required by the compiler.

## Independent validation

`dotnet run --project bridge/ProtocolTests/ProtocolTests.csproj` tests the real HTTP
server, using fake snapshots and no game references. It does not validate mod loading,
GameReader compilation, multiplayer visibility, version compatibility, or game behavior.

After a real assembly build, explicitly approve any installation into the game directory.
Then verify loading, menu/active states, both players, rooms, disconnect/reconnect and
host/client behavior. Do not claim compatibility based on HTTP health alone.

## Provenance

Game API usage follows source inspected in Gennadiyev/STS2MCP commit
55e064850a68f3b4cde7e5fd525bf9b2dec4e885 (0.4.0). Network and sampling code is a
separate minimal implementation, not the upstream state builders. See THIRD_PARTY.md.


## Route-coach preview 0.1.0

The user authorized proceeding with the single-player dashboard and route coach while
co-op tests are deferred. MapReader adapts only upstream graph/UI observation, never
the original state builders or commands. GameReader compares the loaded sts2 assembly
MVID to the uploaded reference build; advice is disabled after an unmatched patch.
The browser adapter stays in backend/app/game/browser_adapter.js. Pure route scoring
lives in frontend/coach.js and consumes normalized state. Dashboard assets are embedded
in the mod; the gaming PC needs no Python, Node, or extra server. New live map capture
still needs validation. Open /coach and the in-game map after updating both mod files.
