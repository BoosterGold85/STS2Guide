// Screen-derived inputs only. This module never reads game state or save files.
export const ROOM_TYPES = ['fight', 'elite', 'rest', 'shop', 'treasure', 'unknown', 'boss', 'ancient'];
export function hpSuggestion(text) {
  if (typeof text !== 'string') return null;
  const candidates = [...text.matchAll(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g)]
    .map(m => ({ hp: Number(m[1]), maxHp: Number(m[2]) }))
    .filter(p => p.maxHp >= 20 && p.maxHp <= 500 && p.hp <= p.maxHp);
  const unique = [...new Map(candidates.map(p => [`${p.hp}/${p.maxHp}`, p])).values()];
  return unique.length === 1 ? unique[0] : null;
}
export function validateMap(nodes, currentId, width, height) {
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 150) throw Error('Mark the current position and at least one next room.');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw Error('Capture a map first.');
  const byId = new Map();
  for (const n of nodes) {
    if (typeof n.id !== 'string' || byId.has(n.id)) throw Error('Map node IDs must be unique.');
    if (!ROOM_TYPES.includes(n.type) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < 0 || n.x > width || n.y < 0 || n.y > height) throw Error('A map node has invalid coordinates or room type.');
    if (!Array.isArray(n.children) || n.children.length > 15) throw Error('Invalid connections.');
    byId.set(n.id, n);
  }
  const current = byId.get(currentId);
  if (!current || !current.children.length) throw Error('Mark your current position and connect it to the next selectable rooms.');
  const done = new Set(), stack = new Set();
  function visit(id) {
    if (stack.has(id)) throw Error('Connections contain a loop.');
    if (done.has(id)) return;
    stack.add(id);
    for (const child of byId.get(id).children) {
      if (!byId.has(child)) throw Error('Connection points to a missing room.');
      if (byId.get(child).y >= byId.get(id).y - 2) throw Error('Connect rooms upwards toward the boss.');
      visit(child);
    }
    stack.delete(id); done.add(id);
  }
  nodes.forEach(n => visit(n.id));
  return { currentId, nextIds: [...new Set(current.children)], ready: true,
    nodes: nodes.map(n => ({ id: n.id, type: n.type, children: [...new Set(n.children)] })) };
}
export function confirmedScreenState({ nodes, currentId, width, height, stats, confirmed, capturedAt }) {
  if (!confirmed) throw Error('Review the screenshot, connections, and stats, then confirm them.');
  const hp = Number(stats.hp), maxHp = Number(stats.maxHp), gold = Number(stats.gold), potions = Number(stats.potions);
  if ([stats.hp, stats.maxHp, stats.gold, stats.potions].some(v => v === '' || v == null)) throw Error('Enter HP, max HP, gold, and potion count.');
  if (![hp, maxHp, gold, potions].every(Number.isSafeInteger) || maxHp < 1 || hp < 1 || hp > maxHp || gold < 0 || potions < 0 || potions > 20) throw Error('Check the HP, gold, and potion values.');
  const age = Date.now() - Date.parse(capturedAt);
  if (!Number.isFinite(age) || age < -30000 || age > 900000) throw Error('The screenshot is older than 15 minutes. Capture the current map again.');
  return { source: 'screen', compatibility: 'screen_confirmed', active: true, isMultiplayer: false,
    players: [{ hp, maxHp, gold, potionCount: potions }], map: validateMap(nodes, currentId, width, height) };
}
