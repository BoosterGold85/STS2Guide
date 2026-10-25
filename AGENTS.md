# STS2 Run Coach

Current user direction: build the first usable single-player dashboard and route coach,
reusing read-only map integration from the uploaded STS2MCP source. Co-op acceptance
is deferred and must remain explicitly unverified. M0 is not fully accepted.
Never issue gameplay actions or modify game files without explicit approval.
Keep bridge JSON interpretation inside backend/app/game; never guess undocumented fields.
State GET endpoints in inspected STS2MCP 0.4.0 have gameplay side effects and must remain
blocked until a side-effect-free implementation is audited. Do not add an unsafe override.
Keep dependencies local; ask before system-level software installation.
Use existing isolated checkout; do not create worktrees unless explicitly requested.
Add parser regression tests, distinguish synthetic and real captures, and document SP/MP
host/client evidence. Bind any future local services to loopback. No combat solving before
stable macro beta. The user explicitly authorized progressing through dashboard/map/route work for single-player.
Do not claim any milestone fully accepted without its actual validation evidence.
