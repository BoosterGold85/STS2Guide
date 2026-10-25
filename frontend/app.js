import { normalize } from './adapter.js';
import { advise } from './coach.js';
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (className) n.className = className; return n; };
let state = null, result = null, selected = 'balanced', demo = false, demoRaw = null, polling = false, generation = 0;
function status(text, kind) { $('connection').textContent = text; $('connection').className = `connection ${kind}`; }
function clear(text, kind = 'offline') {
  state = null; result = null; status(kind === 'offline' ? 'Disconnected' : 'Waiting', kind);
  $('run-stats').replaceChildren(el('div', kind === 'offline' ? 'Game connection unavailable' : 'Waiting for an observation', 'empty-stats'));
  $('strategies').replaceChildren(); $('route-detail').replaceChildren();
  $('route-status').textContent = text; $('route-status').className = 'route-status blocked';
  $('map-view').replaceChildren(el('p', 'No current map observation. Route advice has been cleared.', 'empty'));
  $('boss-name').textContent = ''; $('map-context').textContent = 'Waiting for game';
  $('updated').textContent = 'No current observation';
}
function renderStats() {
  const holder = $('run-stats'); holder.replaceChildren();
  if (!state.active) { holder.append(el('div', 'No active run · Start or resume a modded test run.', 'empty-stats')); return; }
  for (const player of state.players) {
    const card = el('div', null, 'player-card'), title = el('div', null, 'player-name');
    title.append(el('span', player.character.replaceAll('_', ' '), 'character'), el('span', `${player.hp} / ${player.maxHp} HP`, 'hp-label'));
    const meter = el('meter', null, 'hp-meter'); meter.min = 0; meter.max = player.maxHp; meter.value = player.hp; meter.setAttribute('aria-label', `${player.character} health`);
    const resources = el('div', null, 'player-resources');
    for (const [label, value] of [['Gold', player.gold], ['Cards', player.deckCount], ['Relics', player.relicCount], ['Potions', player.potionCount]]) {
      const item = el('span'); item.append(el('strong', value ?? '?'), document.createTextNode(label)); resources.append(item);
    }
    card.append(title, meter, resources); holder.append(card);
  }
  const context = el('div', null, 'run-context');
  for (const [label, value, cls] of [['ACT', state.act, ''], ['FLOOR', state.floor, ''], ['ROOM', (state.room || 'Unknown').replace(/Room$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), 'room']]) {
    const s = el('div', null, `stat ${cls}`); s.append(el('small', label), el('strong', value ?? '—')); context.append(s);
  }
  holder.append(context);
}
function renderAdvice() {
  const strategies = $('strategies'), detail = $('route-detail'); strategies.replaceChildren(); detail.replaceChildren();
  $('route-status').textContent = result.blocked || `${result.routeCount} reachable route${result.routeCount === 1 ? '' : 's'} compared · next ${result.horizon} rooms`;
  $('route-status').className = result.blocked ? 'route-status blocked' : 'route-status';
  if (result.blocked) return;
  for (const route of result.strategies) {
    const card = el('button', null, `strategy ${route.mode === selected ? 'selected' : ''}`); card.type = 'button'; card.dataset.mode = route.mode; card.setAttribute('aria-pressed', String(route.mode === selected));
    const top = el('div', null, 'strategy-top'), name = el('span', route.mode.toUpperCase(), 'strategy-name');
    if (route.mode === 'balanced') name.append(el('span', 'DEFAULT', 'strategy-tag'));
    const score = el('span', route.score, 'score'); score.append(el('small', '/ 100')); top.append(name, score);
    const sequence = el('div', null, 'route-sequence');
    route.rooms.forEach((room, i) => { if (i) sequence.append(el('span', '→', 'route-arrow')); sequence.append(el('span', room)); });
    const first = route.ids[0].split(':').map(Number);
    const location = el('p', `Next: column ${first[0] + 1} · row ${first[1] + 1}`, 'next-location');
    const bottom = el('div', null, 'strategy-bottom'); bottom.append(el('span', `${route.risk} model risk`, `risk ${route.risk.toLowerCase()}`), el('span', route.mode === selected ? 'Highlighted on map' : 'Inspect route →'));
    card.append(top, sequence, location, bottom); card.addEventListener('click', () => { selected = route.mode; renderAdvice(); renderMap(); }); strategies.append(card);
  }
  const route = result.strategies.find(r => r.mode === selected);
  detail.append(el('h3', 'WHY THIS ROUTE'));
  const reasons = el('ul', null, 'reason-list'); route.reasons.forEach(reason => reasons.append(el('li', reason))); detail.append(reasons);
  if (route.warnings.length) { detail.append(el('h3', 'KEEP IN MIND')); const warnings = el('ul', null, 'warning-list'); route.warnings.forEach(w => warnings.append(el('li', w))); detail.append(warnings); }
  if (new Set(result.strategies.map(r => r.ids.join(','))).size === 1) detail.append(el('p', 'All three strategies currently favor the same route.', 'muted'));
  const breakdown = el('details'), summary = el('summary', 'Inspect score components'); breakdown.append(summary);
  route.components.forEach(c => { const row = el('div', null, 'component-row'); row.append(el('span', `${c.step}. ${c.room}`), el('span', `${c.value > 0 ? '+' : ''}${c.value}`)); breakdown.append(row); }); detail.append(breakdown);
}
function svgEl(tag, attrs = {}, text = null) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text != null) n.textContent = text; return n;
}
function renderMap() {
  const holder = $('map-view'); holder.replaceChildren();
  $('boss-name').textContent = state?.map?.boss ? `Boss · ${state.map.boss.replaceAll('_', ' ')}` : '';
  if (!state?.map) { holder.append(el('p', state?.mapError || 'Your map will appear when a run is active.', 'empty')); return; }
  const map = state.map, nodes = new Map(map.nodes.map(n => [n.id, n]));
  $('map-context').textContent = map.ready ? `${map.nextIds.length} selectable next room${map.nextIds.length === 1 ? '' : 's'}` : 'Open the map in game';
  const minCol = Math.min(...map.nodes.map(n => n.col)), maxCol = Math.max(...map.nodes.map(n => n.col));
  const minRow = Math.min(...map.nodes.map(n => n.row)), maxRow = Math.max(...map.nodes.map(n => n.row));
  const width = Math.max(420, (maxCol - minCol) * 70 + 90), height = Math.max(320, (maxRow - minRow) * 55 + 90);
  const x = n => (n.col - minCol) * 70 + (width - (maxCol - minCol) * 70) / 2, y = n => (maxRow - n.row) * 55 + 40;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Act map with the selected suggested route highlighted' });
  const chosen = result?.strategies?.find(r => r.mode === selected)?.ids || [];
  const selectedIds = new Set(chosen), selectedEdges = new Set();
  const fullPath = [map.currentId, ...chosen]; for (let i = 1; i < fullPath.length; i++) selectedEdges.add(`${fullPath[i - 1]}|${fullPath[i]}`);
  for (const n of map.nodes) for (const id of n.children) {
    const child = nodes.get(id); svg.append(svgEl('line', { x1: x(n), y1: y(n), x2: x(child), y2: y(child), class: `map-edge ${selectedEdges.has(`${n.id}|${id}`) ? 'selected' : ''}` }));
  }
  const symbols = { fight: '✕', elite: '♛', rest: '♨', shop: '$', treasure: '◇', unknown: '?', boss: '♜', ancient: '✦', start: '●' };
  for (const n of map.nodes) {
    const group = svgEl('g', { class: `map-node ${selectedIds.has(n.id) ? 'selected' : ''} ${n.id === map.currentId ? 'current' : ''} ${map.nextIds.includes(n.id) ? 'next' : ''}` });
    group.append(svgEl('title', {}, `${n.type}: column ${n.col + 1}, row ${n.row + 1}${n.id === map.currentId ? ' (current)' : ''}`), svgEl('circle', { cx: x(n), cy: y(n), r: 16, class: 'map-dot' }), svgEl('text', { x: x(n), y: y(n) + 1, class: 'map-symbol' }, symbols[n.type]), svgEl('text', { x: x(n), y: y(n) + 29, class: 'map-coordinate' }, `${n.col + 1} · ${n.row + 1}`)); svg.append(group);
  }
  holder.append(svg);
}
function render() {
  renderStats(); result = advise(state, Number($('horizon').value)); renderAdvice(); renderMap();
  $('updated').textContent = demo ? 'Sample run · not live' : `Observed ${new Date(state.timestamp).toLocaleTimeString()}`;
}
async function poll() {
  if (polling || demo) return;
  polling = true; const ticket = generation;
  try {
    const response = await fetch('/coach/v1/state', { cache: 'no-store', signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw Error('Waiting for a fresh game observation. Keep the game running.');
    const next = normalize(await response.json());
    if (Date.now() - Date.parse(next.timestamp) > 6000 || Date.parse(next.timestamp) - Date.now() > 30000) throw Error('Game observation is stale. Waiting for a fresh update.');
    if (ticket !== generation || demo) return;
    state = next; status(next.active ? 'Live run' : 'Connected · no run', 'live'); render();
  } catch (error) {
    if (ticket === generation && !demo) clear(error instanceof TypeError ? 'Open the game with Run Coach enabled. Reconnecting automatically…' : error.message);
  } finally { polling = false; }
}
$('horizon').addEventListener('change', () => { if (state) render(); });
$('demo-toggle').addEventListener('click', async () => {
  generation++; demo = !demo;
  $('demo-notice').hidden = !demo; $('demo-toggle').textContent = demo ? 'Return to live run' : 'Explore demo';
  if (!demo) { clear('Reconnecting to your live game…', 'waiting'); poll(); return; }
  try {
    if (!demoRaw) { const response = await fetch('/assets/demo.json'); if (!response.ok) throw Error('Demo unavailable'); demoRaw = await response.json(); }
    if (!demo) return;
    state = normalize(demoRaw); status('Demo · not live', 'demo'); render();
  } catch (error) { clear(error.message, 'waiting'); }
});
clear('Open the game with Run Coach enabled. The dashboard reconnects automatically.', 'waiting');
poll(); setInterval(poll, 1500);
