// Pure deterministic route engine. No HTTP, DOM, raw bridge fields, or game commands.
export const ENGINE_VERSION = 'route-heuristic-0.1';
export const LABELS = { fight: 'Fight', elite: 'Elite', rest: 'Campfire', shop: 'Shop',
  treasure: 'Treasure', boss: 'Boss', unknown: '?', ancient: 'Ancient', start: 'Start' };
export const MODES = ['safe', 'balanced', 'aggressive'];
export const ASSUMPTIONS = Object.freeze({ fightDamage: 7, eliteDamage: 18, unknownDamage: 4,
  bossDamage: 24, restHealFraction: 0.30, fightGold: 15, eliteGold: 25, usefulShopGold: 150 });
export function enumerateRoutes(map, horizon = 6, limit = 4096) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 10) throw Error('Lookahead must be 1–10 rooms');
  if (!map || !map.ready || !map.nextIds.length) return [];
  const nodes = new Map(map.nodes.map(n => [n.id, n]));
  const routes = [];
  const walk = (id, path, seen) => {
    if (seen.has(id)) throw Error('Route graph contains a cycle');
    const node = nodes.get(id);
    if (!node) throw Error('Incomplete route graph');
    const next = [...path, node];
    if (next.length >= horizon || !node.children.length) {
      if (routes.length >= limit) throw Error('Too many routes; use a shorter lookahead');
      routes.push(next); return;
    }
    const visited = new Set(seen); visited.add(id);
    for (const child of [...node.children].sort()) walk(child, next, visited);
  };
  for (const id of [...map.nextIds].sort()) walk(id, [], new Set());
  return routes;
}
export function scoreRoute(route, player, mode = 'balanced') {
  if (!MODES.includes(mode)) throw Error('Unknown strategy');
  if (!player || player.maxHp <= 0 || !route.length) throw Error('Missing scoring inputs');
  const riskWeight = { safe: 1.8, balanced: 1.0, aggressive: 0.6 }[mode];
  let hp = player.hp, gold = player.gold, value = 0, costs = 0, elites = 0, eliteStreak = 0;
  let exhausted = false, healed = 0, totalDamage = 0;
  const reasons = [], warnings = [], components = [];
  const initialRatio = player.hp / player.maxHp;
  if (initialRatio < 0.5) warnings.push('HP is below half: recovery and fewer elites matter more.');
  if ((player.potionCount ?? 0) === 0) warnings.push('No potions available as an emergency buffer.');
  route.forEach((node, index) => {
    const discount = Math.pow(0.92, index);
    let gain = 0, damage = 0, penalty = 0;
    switch (node.type) {
      case 'fight': gain = 5; damage = ASSUMPTIONS.fightDamage; gold += ASSUMPTIONS.fightGold; break;
      case 'elite':
        gain = { safe: 7, balanced: 19, aggressive: 31 }[mode];
        damage = ASSUMPTIONS.eliteDamage; elites++; eliteStreak++; gold += ASSUMPTIONS.eliteGold;
        penalty += Math.max(0, eliteStreak - 1) * 13 * riskWeight;
        if (hp / player.maxHp < 0.45) penalty += 18 * riskWeight;
        break;
      case 'rest': {
        const recovered = Math.min(player.maxHp - hp, Math.floor(player.maxHp * ASSUMPTIONS.restHealFraction));
        hp += recovered; healed += recovered; eliteStreak = 0;
        gain = 5 + recovered / player.maxHp * 55;
        if (recovered > 0) reasons.push(`Campfire at step ${index + 1} offers recovery before later rooms.`);
        else reasons.push(`Campfire at step ${index + 1} offers an upgrade opportunity.`);
        break;
      }
      case 'shop':
        gain = gold >= ASSUMPTIONS.usefulShopGold ? 16 : gold >= 80 ? 5 : -3;
        if (gold >= ASSUMPTIONS.usefulShopGold) {
          reasons.push(`Shop at step ${index + 1} fits the estimated gold budget.`);
          gold -= ASSUMPTIONS.usefulShopGold; // Don't spend the same notional budget twice.
        }
        else warnings.push('Shop value is limited by the estimated gold budget; actual stock is unknown.');
        break;
      case 'treasure': gain = 15; break;
      case 'unknown': gain = 4; damage = ASSUMPTIONS.unknownDamage; penalty = mode === 'safe' ? 2 : 0; break;
      case 'boss': gain = 4; damage = ASSUMPTIONS.bossDamage; break;
      case 'ancient': gain = 6; break;
      case 'start': break;
      default: throw Error('Unsupported scoring room');
    }
    const hpBefore = Math.max(1, hp);
    totalDamage += damage; hp -= damage;
    const damagePenalty = damage / player.maxHp * 60 * riskWeight * (1 + (1 - Math.min(1, hpBefore / player.maxHp)));
    if (hp <= 0) { exhausted = true; penalty += 45 * riskWeight; }
    const stepValue = (gain - damagePenalty - penalty) * discount;
    value += stepValue; costs += damagePenalty + penalty;
    components.push({ step: index + 1, room: LABELS[node.type], value: Math.round(stepValue * 10) / 10 });
  });
  if (exhausted) warnings.push('The simple HP budget runs out on this route; actual combat may differ.');
  if (elites >= 2) warnings.push(`${elites} elites within this lookahead increase risk.`);
  if (route.some(n => n.type === 'unknown')) warnings.push('Question-mark outcomes are unknown.');
  if (!elites) reasons.push('Avoids elite encounters within this lookahead.');
  else reasons.push(`${elites} elite${elites === 1 ? '' : 's'} offer relic value at higher estimated HP cost.`);
  if (!healed && initialRatio < 0.6) warnings.push('No effective recovery within this route.');
  const score = Math.round(Math.max(0, Math.min(100, 50 + value / Math.sqrt(route.length))));
  const risk = exhausted || (elites > 0 && initialRatio < 0.5) || elites >= 2 ? 'High' : elites || totalDamage > player.maxHp * 0.3 ? 'Moderate' : 'Low';
  return { ids: route.map(n => n.id), rooms: route.map(n => LABELS[n.type]), mode, score, risk,
    reasons: [...new Set(reasons)].slice(0, 4), warnings: [...new Set(warnings)], components,
    features: { elites, estimatedDamage: totalDamage, possibleHealing: healed },
    rawValue: value, cost: costs };
}
export function advise(state, horizon = 6) {
  if (!state.active) return { blocked: 'No active run. Start or resume your modded test run.', strategies: [] };
  if (state.isMultiplayer) return { blocked: 'Co-op route advice is not validated yet. Player stats are still shown.', strategies: [] };
  if (state.source === 'screen' ? state.compatibility !== 'screen_confirmed' : state.compatibility !== 'assembly_matched') return { blocked: 'Game build is unsupported. Route advice is disabled.', strategies: [] };
  if (state.players.length !== 1 || state.players[0].hp <= 0) return { blocked: 'An active single-player character is required.', strategies: [] };
  if (!state.map) return { blocked: state.mapError || 'Map data is not available yet.', strategies: [] };
  if (!state.map.ready) return { blocked: state.map.notice || 'Open the map in the game to see selectable routes.', strategies: [] };
  try {
    const routes = enumerateRoutes(state.map, horizon);
    if (!routes.length) return { blocked: 'No selectable routes are visible. Open the map in the game.', strategies: [] };
    const strategies = MODES.map(mode => {
      const ranked = routes.map(route => scoreRoute(route, state.players[0], mode)).sort((a, b) => b.score - a.score || b.rawValue - a.rawValue || a.ids.join(',').localeCompare(b.ids.join(',')));
      return { ...ranked[0], alternativeCount: ranked.length - 1 };
    });
    return { blocked: null, strategies, routeCount: routes.length, horizon, engineVersion: ENGINE_VERSION };
  } catch (error) { return { blocked: error.message, strategies: [] }; }
}
