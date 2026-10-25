# Validation

Run `PYTHONPATH=backend python3 -m unittest discover -s tests -v` from repository root.
Tests exercise SP/MP normalization, explicit local-slot inventory merging, null remote
inventories, unknown fields, menu/overlay distinction, invalid schemas, partial roster
rejection, sanitized no-overwrite exports, real localhost HTTP health requests, repeated
polling, redirect rejection, and endpoint denial before network access. Disconnect
recovery is simulated at the transport; no live game is involved.

Live acceptance remains unrun: game before/after helper, start/end/resume run, host bridge
only, client bridge only, both bridges, different characters/mods, and genuine reconnect.
Record exact game/mod versions and compare every normalized field against in-game UI.
Never treat synthetic fixtures or mocked transport results as live compatibility evidence.


## Separate bridge protocol

With a local .NET 9 SDK:
`dotnet run --project bridge/ProtocolTests/ProtocolTests.csproj`.
Cloud SDK: `/workspace/tooling/dotnet/dotnet` (9.0.319), installed locally after
SHA512 verification against Microsoft release metadata. Set `DOTNET_CLI_HOME` and
`NUGET_PACKAGES` to writable paths if needed. No system SDK was installed.
17 checks passed on the real HTTP server; 23 Python tests passed.
The full real mod now compiles against user-uploaded game references with zero warnings
and errors, including per-player deck count access. PowerShell build instructions have not been executed
in this Linux environment. They do not install SDKs or copy files into the game.

A real end-to-end fixture check also passed: Python ReadOnlyBridgeClient fetched the
C# server's greeting and snapshot, and normalized both players including deck count.
This uses a synthetic snapshot, not a running game. The TCP listener requires no
HTTP.sys URL ACL registration; Windows runtime behavior still needs local testing.

The Python suite now includes a real user-provided SP snapshot regression: 24 tests
pass. See tests/fixtures/README.md for provenance. Live refresh, disconnect/reconnect,
and co-op acceptance remain unrun. No C# change or mod rebuild was needed.

## Route-coach preview

`npm test` runs 22 Node tests for the normalized adapter, graph validation/enumeration,
low-HP recovery, campfire ordering, elite exposure, shop budget/timing, deterministic
scores and safety gates. No npm runtime dependencies are needed.
The C# protocol suite now has 26 HTTP checks including embedded dashboard/module MIME,
same-origin modules, CSP, path confinement, existing method/host/body restrictions,
and stale snapshots. The complete mod compiles against uploaded references.

The real Chromium suite exercises the compiled C# server with synthetic snapshots:

```sh
dotnet build bridge/ProtocolTests/ProtocolTests.csproj
PLAYWRIGHT_MODULE=/path/to/playwright-core DOTNET_BIN=/path/to/dotnet \
  node tests/dashboard.browser.mjs
```

Requires playwright-core and a local Chromium binary (CHROMIUM_BIN defaults to
/usr/bin/chromium); they are development-only tools, not packaged user dependencies.
It checks real rendering, route controls, map, mobile overflow, explicit demo mode,
co-op/compatibility/map gates, invalid graph, stale/disconnected clearing, recovery,
and JavaScript errors. It saves screenshots in artifacts/. The preview screenshot
shows demo mode so it is not mistaken for live map evidence.

Still required locally: install the new two-file mod, open /coach, open the in-game
map, and compare nodes, selectable next rooms, and highlights with the actual map.
The earlier user SP snapshots do not contain map data, so those cannot certify new
map parsing or recommendation quality. Co-op advice remains disabled.

Final preview verification: 30 Python tests, 22 Node tests, 26 real HTTP checks,
and the Chromium smoke suite pass. The release DLL builds with zero warnings/errors
against the uploaded game references. ZIP hashes and embedded resources were verified;
only the custom mod DLL is distributed, never sts2.dll or GodotSharp.dll.
