# Route heuristic 0.1

The pure engine is frontend/coach.js. It consumes normalized models, never raw bridge
JSON, and has no network, DOM, save access, or game command capabilities. Bridge JSON
is interpreted in backend/app/game/browser_adapter.js and served as an embedded module.

Routes start only at the game's observed selectable map points, and follow full map
connections over 4/6/8 rooms. Graph validation rejects duplicate nodes, cycles, dangling
connections, unsupported room types and invalid current choices. Enumeration has a
4096-path cap; exceeding it blocks advice instead of silently dropping paths.

Each mode applies discounted room value minus estimated HP cost and risk penalties.
Assumptions are exported as ASSUMPTIONS: fight 7 HP / 15 gold, elite 18 HP / 25 gold,
unknown 4 HP, boss 24 HP, campfire heal 30% of max HP, useful-shop budget 150 gold.
Shops consume the notional budget so multiple shops cannot reuse the same 150 gold.
This is route-value accounting, not an instruction to purchase or spend that amount.

Safe gives HP cost 1.8x weight, Balanced 1x, Aggressive 0.6x. Elite reward values are
7/19/31 by mode. Multiple elites without a campfire and elites at low HP add penalties.
Scores clamp a normalized route value to 0–100. Scores are comparable within the same
mode/lookahead/state; 80 never means 80% survival. Low/Moderate/High risk is a rule label,
not an empirically calibrated probability. Room-by-room components remain inspectable.

The engine shows warnings if the budget runs out, a route has multiple elites, HP is
low, unknown rooms appear, or no potion buffer is present. Potion effects are unknown,
so potion counts affect warnings, not projected healing. Campfire upgrades receive a
small fixed opportunity value; the engine does not inspect upgrade strength. Recovery
assumes resting is available; special relic/event restrictions are not modeled yet.

Deck count is displayed but deck strength, cards, relic effects, enemies, shop stock,
actual event outcomes, ascension scaling, and boss matchup are not evaluated. Unknown
rooms represent uncertainty, not guaranteed events. The model is an experimental
second opinion, not evidence for an easiest/highest-probability route claim.

Advice gates: exact coach protocol/version, the uploaded game's matching assembly MVID,
active single-player character, valid map, and game-exposed selectable map choices.
Co-op advice is explicitly disabled until live host/client tests. Assembly matching
identifies the build; it does not certify recommendation quality or other loaded mods.

Browser polling refuses stale data and clears all advice after errors. No game actions,
profile selection bypass, or save migration is implemented. The user explicitly asked
to move on to the single-player coach with co-op validation deferred; the original
roadmap milestones must not be described as fully accepted.
