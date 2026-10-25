// The only browser module that interprets bridge JSON. The engine gets stable models.
const integer = (value, label, nullable = false) => {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid ${label}`);
  return value;
};
const types = { Monster: 'fight', Elite: 'elite', RestSite: 'rest', Shop: 'shop',
  Treasure: 'treasure', Boss: 'boss', Unknown: 'unknown', Ancient: 'ancient', Unassigned: 'start' };
export function normalize(raw) {
  if (!raw || raw.schema !== 'run-coach-readonly-v1' || raw.bridge_id !== 'RunCoach.ReadOnly' ||
      raw.bridge_version !== '0.1.0-preview' || raw.status !== 'ok') throw Error('Update the bridge to the route-coach preview.');
  if (typeof raw.active !== 'boolean' || (raw.is_multiplayer !== null && typeof raw.is_multiplayer !== 'boolean')) throw Error('Invalid run flags');
  if (!Number.isFinite(Date.parse(raw.timestamp))) throw Error('Invalid observation timestamp');
  if (!Array.isArray(raw.players) || raw.players.length > 8 || (raw.active && !raw.players.length) || (!raw.active && raw.players.length)) throw Error('Invalid roster');
  const players = raw.players.map((p, i) => {
    if (p.slot !== i || typeof p.character !== 'string') throw Error('Invalid player identity');
    const hp = integer(p.current_hp, 'HP'), maxHp = integer(p.max_hp, 'max HP');
    if (maxHp === 0 || hp > maxHp) throw Error('Invalid HP');
    return { slot: i, character: p.character, hp, maxHp, gold: integer(p.gold, 'gold'),
      deckCount: integer(p.deck_count, 'deck', true), relicCount: integer(p.relic_count, 'relics', true),
      potionCount: integer(p.potion_count, 'potions', true) };
  });
  if (raw.active && raw.is_multiplayer === null) throw Error('Run mode unavailable');
  if (raw.is_multiplayer === false && players.length !== 1) throw Error('Single-player roster mismatch');
  let map = null, mapError = raw.map_error || null;
  // Bad map data never prevents displaying valid run stats, but does disable advice.
  if (raw.map != null) {
    try { map = normalizeMap(raw.map); } catch (error) { mapError = error.message; }
  }
  return { active: raw.active, isMultiplayer: raw.is_multiplayer, timestamp: raw.timestamp,
    compatibility: raw.compatibility, room: raw.current_room_type, act: integer(raw.act, 'act', true),
    floor: integer(raw.floor, 'floor', true), ascension: integer(raw.ascension, 'ascension', true),
    saveProfile: raw.save_profile_mode || 'unknown', players, map, mapError };
}
export function normalizeMap(raw) {
  if (!raw || !Array.isArray(raw.nodes) || raw.nodes.length < 1 || raw.nodes.length > 512) throw Error('Map graph unavailable');
  if (typeof raw.decision_ready !== 'boolean' || !Array.isArray(raw.reachable_now_ids)) throw Error('Map choices unavailable');
  const ids = new Set();
  const nodes = raw.nodes.map(n => {
    if (typeof n.node_id !== 'string' || !/^-?\d+:-?\d+$/.test(n.node_id) || ids.has(n.node_id)) throw Error('Duplicate or invalid map node');
    ids.add(n.node_id);
    if (!Number.isSafeInteger(n.col) || !Number.isSafeInteger(n.row) || Math.abs(n.col) > 100 || Math.abs(n.row) > 100 || n.node_id !== `${n.col}:${n.row}`) throw Error('Invalid map coordinates');
    if (!Object.hasOwn(types, n.type)) throw Error(`Unsupported room type: ${String(n.type)}`);
    if (!Array.isArray(n.children) || n.children.length > 16 || n.children.some(c => typeof c !== 'string')) throw Error('Invalid map connections');
    return { id: n.node_id, col: n.col, row: n.row, type: types[n.type], children: [...new Set(n.children)] };
  });
  for (const node of nodes) if (node.children.some(id => !ids.has(id))) throw Error('Incomplete map connections');
  if (!ids.has(raw.current_node_id) || raw.reachable_now_ids.some(id => !ids.has(id))) throw Error('Current map position is unavailable');
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (raw.reachable_now_ids.some(id => byId.get(id).type === 'start')) throw Error('An unassigned next room cannot be scored');
  const done = new Set(), stack = new Set();
  function visit(id) {
    if (stack.has(id)) throw Error('Map contains a cycle');
    if (done.has(id)) return;
    stack.add(id);
    for (const child of byId.get(id).children) visit(child);
    stack.delete(id); done.add(id);
  }
  for (const id of ids) visit(id);
  return { currentId: raw.current_node_id, nodes, nextIds: [...new Set(raw.reachable_now_ids)],
    ready: raw.decision_ready, boss: typeof raw.boss === 'string' ? raw.boss : null,
    notice: typeof raw.notice === 'string' ? raw.notice : null };
}
