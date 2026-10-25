# Architecture

Game properties -> C# read-only snapshot -> loopback HTTP -> browser adapter -> normalized
models -> pure route engine -> browser dashboard. The browser never sends gameplay
commands. Method/path allowlists and a tiny fixed asset map reject other HTTP routes.

GameReader and MapReader run on ProcessFrame, sampling every 500 ms. They read the
current run, per-player resources, map graph, visited coordinates, and map UI point
travelability. They never open UI, click, call actions, mutate save routing, or write saves.
Map failure leaves valid player stats usable while withholding recommendations.

BridgeServer serves cached snapshots, refusing samples older than five seconds, plus
embedded static assets. Only loopback TCP is bound. Strict Host checks, same-origin
policy, CSP, no CORS, GET-only dispatch, bounded headers/read/write time and no bodies
reduce the surface. No file paths from requests are resolved. No CDN or LLM is used.
The original STS2MCP state builders/action files are not installed or called.

The existing Python adapter/CLI stays as a separate diagnostic tool and accepts both
bridge versions. The shipped UI uses native browser modules to avoid installing a
Python server or Node on the gaming PC. The recommended React/FastAPI stack in the
handoff was a candidate; this simpler package delivers the first coach with two files.
