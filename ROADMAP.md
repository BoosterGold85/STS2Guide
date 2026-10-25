# Roadmap and current scope

The user explicitly requested proceeding to a usable single-player coach after live
SP connection checks, while deferring co-op. The earlier milestone gating is relaxed
for that scope; no milestone is silently marked fully accepted.

- M0 connection: user verified SP state, room/resource refresh, game restart/resume,
  and no-active-run state. Co-op host/client and live Python-helper recovery unverified.
- M1 dashboard: implemented; fixture-backed Chromium desktop/mobile validation passes.
- M2 map graph/routes: implemented from observed STS2MCP source, compiles against the
  actual uploaded game; needs first live map payload and route cross-check on the PC.
- M3 route coach: heuristic preview implemented with Safe/Balanced/Aggressive scores,
  explanations and regression tests. Not empirically calibrated; not live accepted.
- M4–M8 future: deck/card/macro/boss advisors, run intelligence, stable macro beta.
- Combat work remains deferred until the macro engine is stable.

Single-player only for advice. Stats may show multiple players but no co-op ranking is
shown. Keep normal/modded saves separate. No action dispatch or save migration.

## Current external-app direction

The user wants normal card progress without mods. A standalone Windows screen capture
app, OCR hints, guided map editor and always-on-top reviewed-plan window are now built.
No game libraries, memory reads, input injection or save routing are used. Native
Windows execution is unverified here. Automatic room/edge recognition remains a
separate unfinished requirement awaiting actual game screenshots for development/tests.
Do not call the guided editor a fully automatic overlay reader.
