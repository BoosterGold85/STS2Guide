# Fixture provenance

`live_sp_v01071_act1_start.json` is the exact bridge state response pasted by the user
from the local browser on 2026-10-24, following mod loading on game v0.107.1
(2026.06.18), as shown in their screenshot. No platform/user identifiers or machine
paths are present. The payload's `game_version` remains null; the screenshot is
external version evidence. Seven fractional timestamp digits are retained as received.

All other JSON fixtures are synthetic, derived from inspected upstream source or
from the separately defined RunCoach.ReadOnly protocol. They are not live captures.

One real SP snapshot proves this payload parses, not refresh, host/client support,
continued accuracy after combat, full acceptance, or automatic game-version discovery.

`live_sp_v01071_act1_combat.json` is the subsequent user-pasted live response at
2026-10-24T23:40:18.7275359+00:00. Following the requested room-change check, floor
changed 0 -> 1 and room MapRoom -> CombatRoom, with unchanged player values. This
supports refresh across that room transition, not HP/gold changes or co-op behavior.

`live_sp_v01071_act1_hp68.json` is the third user-pasted live response at
2026-10-24T23:41:20.2262579+00:00. HP changed 80 -> 68, while gold and inventory
counts remained unchanged. Room remains CombatRoom. The response does not establish
combat completion, reward collection, or agreement with the displayed in-game HP.

`live_sp_v01071_act1_rewards.json` is the fourth user-pasted live response at
2026-10-24T23:44:00.7411892+00:00 after the reward-collection check. Gold changed
99 -> 117 and deck count 10 -> 11. HP stayed 68; the user separately confirmed that
68 matched the game display. Room stayed CombatRoom: this names the underlying room,
not whether combat is currently ongoing or whether rewards are open.

`live_sp_v01071_act1_resumed.json` is the response supplied after the user closed the
game (browser showed connection refused), relaunched it, and resumed the modded run.
Timestamp: 2026-10-24T23:45:50.8388166+00:00. HP remains 68, but gold/deck are 99/10
rather than the prior reward response's 117/11. The cause is not yet confirmed; do not
silently call this expected checkpoint behavior without comparing the in-game values.

`live_sp_v01071_inactive.json` is the user-supplied no-active-run response at
2026-10-24T23:47:12.4261179+00:00. Active is false, players is empty, and run-specific
fields are null. The user also confirmed the post-restart 99 gold/10 cards matched
the game UI, supporting save-checkpoint restoration rather than a bridge mismatch.
