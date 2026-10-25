# Run Coach Desktop 0.2.0 screen preview

A separate Windows app: no STS2 mod, game DLL reference, memory reading, input injection,
save access or save-profile routing. It captures the visible foreground game's client
area using Windows screen capture, runs local Windows OCR, and offers a browser review
editor plus an always-on-top advice window. All capture data stays in memory on the PC.

**This is not an automatic Untapped-style reader yet.** HP OCR suggestions need review;
gold/potions are entered manually, and map room types/connections are annotated by the
user. There are no game-specific templates or verified automatic map/edge detector.
An actual in-game map screenshot is required before developing/validating that next step.
The current tool can score a user-reviewed map using the existing deterministic engine.

## Use (Windows 10 build 19041+ / Windows 11, x64)

1. Close the game. Move only our earlier `RunCoach.ReadOnly.dll` and `.json` out of its
   mods folder. Other loaded mods can also select modded progress; this app does not
   change which profile the game selects. Leave all save files alone.
2. Extract the external-screen ZIP into a normal folder, outside the game directory.
3. Run `RunCoach.Desktop.exe`. No Python, Node, .NET SDK or administrator rights needed.
4. The small overlay and browser editor open. The editor is at
   `http://127.0.0.1:15528/screen` (different port from the earlier mod).
5. In a windowed/borderless normal game, open the map, focus the game and press **F8**.
   Alternatively click Capture in 3 seconds, then switch to the game during the delay.
6. Return to the browser. Review any suggested HP. Enter gold/potions. Mark the current
   position and upcoming rooms, using the type selector; connect them upwards according
   to visible paths. Mark only enough of the upcoming map to compare your choices.
7. Confirm the stats/annotations, then Compare routes. Select a strategy to send its
   reviewed plan to the always-on-top overlay. You make all actual moves in the game.

Imported PNG/JPEG screenshots work in the browser too. Imported-image advice is browser
only; the native overlay accepts only captures made by this app. Any input edit clears
the confirmed plan. Reviewed plans expire after 90 seconds; a screenshot older than
15 minutes cannot be scored. Recapture after the game/map changes. Captures are not
periodically taken in the background and no image is uploaded or saved by the app.

## Limits and validation

Compiled for Windows x64 in the Linux cloud, zero warnings/errors. The Windows UI,
F8 registration, screen capture, and Windows OCR cannot run in this Linux environment
and remain unverified on an actual PC. The local service and browser editor were
exercised with synthetic captures. Cross-compilation is not native-runtime acceptance.
This is an unsigned test build; if Windows blocks it, report the message rather than
changing security settings. The source and build commands are included in the repo.

The entire game window must be visible on one monitor. Other overlapping windows may
obscure/cross into the cropped image; move them aside. Protected/exclusive-fullscreen
content may not capture; use windowed/borderless mode. Only process/window metadata is
used to identify SlayTheSpire2/sts2; no process memory is opened or read. The app hides
its own overlay during capture and requests Windows capture exclusion for that window.

OCR has no calibrated confidence; any ambiguous HP match is discarded. Confirmation
is mandatory before scoring. Routes use hand-marked paths, not verified legal actions.
Advice is limited to single-player map heuristics, not card/combat solving or win odds.

## Build / test

```sh
dotnet publish external/RunCoach.Desktop/RunCoach.Desktop.csproj -c Release -r win-x64 \
  --self-contained true -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true \
  -o artifacts/external-win-x64
python3 scripts/package_external.py  # uses NUGET_PACKAGES or ~/.nuget/packages for license files
npm test
dotnet run --project bridge/ProtocolTests/ProtocolTests.csproj
```

Browser test: `PLAYWRIGHT_MODULE=/path/to/playwright-core DOTNET_BIN=/path/to/dotnet
node tests/screen.browser.mjs`, after building ProtocolTests. It checks local image
import, manual annotation/branch connections, required confirmation, three strategies,
input invalidation, capture/OCR suggestion consumption, mobile layout and JS errors.
The existing mod/browser diagnostic tests remain separate. No game assemblies are
required to build or run this external app.
