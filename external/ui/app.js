import { hpSuggestion, confirmedScreenState, ROOM_TYPES } from './screen_model.js';
import { advise } from '/assets/coach.js';
const $ = id => document.getElementById(id), canvas = $('map-canvas'), ctx = canvas.getContext('2d');
let reviewedAt = null;
let image = null, nodes = [], currentId = null, nextId = 1, tool = 'add', connecting = null, captureId = null, capturedAt = null, result = null, selected = 'balanced', latestSeen = null, polling = false;
const symbols = { fight: '✕', elite: '♛', rest: '♨', shop: '$', treasure: '◇', unknown: '?', boss: '♜', ancient: '✦' };
const element = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; };
function message(text) { $('capture-status').textContent = text; }
function invalidate() { fetch('/screen/v1/clear').catch(() => {}); $('confirm').checked = false; result = null; $('advice').replaceChildren(element('p', 'Map or stats changed. Review and confirm before scoring.', 'hint')); draw(); }
function draw() {
  if (!image) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
  const highlight = result?.strategies.find(r => r.mode === selected)?.ids || [];
  const path = [currentId, ...highlight], edges = new Set(path.slice(1).map((n, i) => `${path[i]}|${n}`));
  const radius = Math.max(11, canvas.width / 90);
  for (const n of nodes) for (const id of n.children) {
    const c = nodes.find(p => p.id === id); if (!c) continue;
    ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(c.x, c.y); ctx.lineWidth = edges.has(`${n.id}|${id}`) ? 5 : 3; ctx.strokeStyle = edges.has(`${n.id}|${id}`) ? '#ffd386' : '#84d8bb'; ctx.stroke();
  }
  for (const n of nodes) {
    ctx.beginPath(); ctx.arc(n.x, n.y, radius, 0, Math.PI * 2); ctx.fillStyle = n.id === currentId ? '#256e52' : '#18312b'; ctx.fill(); ctx.strokeStyle = n.id === connecting || highlight.includes(n.id) ? '#ffd386' : '#8bd7bd'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff3d3'; ctx.font = `${radius + 3}px Segoe UI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(symbols[n.type], n.x, n.y);
    ctx.font = `${Math.max(11, radius * .7)}px Segoe UI`; ctx.fillStyle = '#fff'; ctx.fillText(n.id === currentId ? 'YOU' : n.id, n.x, n.y + radius + 12);
  }
}
async function loadImage(src, id, timestamp, text = '', ocrError = null) {
  const next = new Image(); next.src = src; await next.decode();
  if (next.width > 8000 || next.height > 5000) throw Error('Screenshot is too large; use a game-window capture.');
  image = next; canvas.width = next.width; canvas.height = next.height;
  captureId = id; capturedAt = timestamp; nodes = []; currentId = null; nextId = 1; connecting = null;
  $('empty').hidden = true; invalidate();
  const hint = hpSuggestion(text);
  $('hp').value = hint?.hp ?? ''; $('max-hp').value = hint?.maxHp ?? ''; $('gold').value = ''; $('potions').value = '';
  $('ocr-status').textContent = ocrError || (hint ? `OCR suggests ${hint.hp}/${hint.maxHp} HP. Check it against the image; enter gold and potions manually.` : 'No unambiguous HP reading. Enter the visible stats manually.');
  message('Capture ready. Mark the rooms and connections you want compared, then confirm. Map recognition is manual in this preview.');
  draw();
}
canvas.addEventListener('click', event => {
  if (!image) return;
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
  const nearest = [...nodes].sort((a, b) => Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
  const hit = nearest && Math.hypot(nearest.x-x, nearest.y-y) < Math.max(22, canvas.width / 60) ? nearest : null;
  if (tool === 'add') {
    if (hit) hit.type = $('room-type').value;
    else nodes.push({ id: String(nextId++), x, y, type: $('room-type').value, children: [] });
  } else if (tool === 'current' && hit) currentId = hit.id;
  else if (tool === 'remove' && hit) { nodes = nodes.filter(n => n.id !== hit.id); nodes.forEach(n => n.children = n.children.filter(c => c !== hit.id)); if (currentId === hit.id) currentId = null; }
  else if (tool === 'connect' && hit) {
    if (!connecting) connecting = hit.id;
    else {
      const from = nodes.find(n => n.id === connecting);
      if (hit.y >= from.y - 2) { message('Connect from the lower room to an upper room.'); connecting = null; draw(); return; }
      if (from.children.includes(hit.id)) from.children = from.children.filter(id => id !== hit.id); else from.children.push(hit.id);
      connecting = null;
    }
  }
  invalidate();
});
const help = { add: 'Select a room type and click each visible room. Click an existing marker to correct its type.', connect: 'Click a lower room, then an upper room connected to it in the screenshot. Repeat to remove a connection.', current: 'Click the marked room representing your current map position. Connect it only to the next selectable rooms.', remove: 'Click a marker to remove it and its connections.' };
for (const name of Object.keys(help)) $(name).addEventListener('click', () => { tool = name; connecting = null; for (const n of Object.keys(help)) $(n).classList.toggle('active', n === name); $('tool-help').textContent = help[name]; draw(); });
$('clear').addEventListener('click', () => { nodes = []; currentId = null; connecting = null; nextId = 1; invalidate(); });
for (const id of ['hp', 'max-hp', 'gold', 'potions', 'horizon']) $(id).addEventListener('input', invalidate);
$('confirm').addEventListener('change', () => { if (!$('confirm').checked) invalidate(); });
async function showOverlay(route) {
  if (!captureId || captureId.startsWith('upload-')) return 'Imported image: advice is shown here; native overlay needs an F8 capture.';
  try {
    const data = { capture_id: captureId, mode: route.mode, score: route.score, route: route.rooms.join(' → ') };
    const response = await fetch('/screen/v1/plan?data=' + encodeURIComponent(JSON.stringify(data)));
    if (!response.ok) throw Error();
    return 'This reviewed plan is shown in the desktop overlay. F8 to capture again.';
  } catch { return 'Overlay was not updated. Capture the current map again.'; }
}
async function renderRoutes() {
  const holder = $('advice'); holder.replaceChildren();
  if (result.blocked) { holder.append(element('p', result.blocked, 'warning')); return; }
  for (const route of result.strategies) {
    const card = element('button', null, `route ${route.mode === selected ? 'selected' : ''}`); card.type = 'button';
    const title = element('h3', route.mode.toUpperCase()); title.append(element('span', `${route.score}/100`));
    card.append(title, element('div', route.rooms.join(' → '), 'path'), element('p', `${route.risk} model risk · next marker ${route.ids[0]}`));
    if (route.mode === selected) {
      const list = element('ul'); route.reasons.forEach(r => list.append(element('li', r))); card.append(list);
      route.warnings.forEach(w => card.append(element('p', w, 'warning')));
    }
    card.addEventListener('click', async () => { selected = route.mode; draw(); await renderRoutes(); }); holder.append(card);
  }
  const note = element('p', 'Updating overlay…', 'overlay-message'); holder.append(note);
  note.textContent = await showOverlay(result.strategies.find(r => r.mode === selected));
}
$('score').addEventListener('click', async () => {
  try {
    const state = confirmedScreenState({ nodes, currentId, width: canvas.width, height: canvas.height, stats: { hp: $('hp').value, maxHp: $('max-hp').value, gold: $('gold').value, potions: $('potions').value }, confirmed: $('confirm').checked, capturedAt });
    reviewedAt = Date.now(); result = advise(state, Number($('horizon').value)); await renderRoutes(); draw();
  } catch (error) { $('advice').replaceChildren(element('p', error.message, 'warning')); }
});
$('upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 20000000) { message('Choose a PNG/JPEG smaller than 20 MB.'); return; }
  const reader = new FileReader();
  reader.onload = async () => { try { await loadImage(reader.result, 'upload-' + Date.now(), new Date().toISOString()); } catch (error) { message(error.message); } };
  reader.readAsDataURL(file);
});
async function poll() {
  if (polling) return; polling = true;
  try {
    const response = await fetch('/screen/v1/status', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!response.ok) return;
    const info = await response.json();
    if (info.error && !info.capture_id) {
      message(info.error);
      if (captureId && !captureId.startsWith('upload-')) { image = null; nodes = []; currentId = null; captureId = null; latestSeen = null; canvas.width = 0; $('empty').hidden = false; invalidate(); }
    }
    if (info.capture_id && info.capture_id !== latestSeen) {
      latestSeen = info.capture_id;
      const snapshot = await (await fetch('/screen/v1/image?id=' + encodeURIComponent(info.capture_id))).json();
      await loadImage(snapshot.image, info.capture_id, info.captured_at, info.text || '', info.ocr_error);
    }
  } catch { if (!image) message('Start RunCoach.Desktop.exe to capture the game, or import a screenshot.'); }
  finally { polling = false; }
}
setInterval(() => {
  if (result && Date.now() - reviewedAt > 90000) { result = null; $('confirm').checked = false; $('advice').replaceChildren(element('p', 'Plan expired. Capture the current map again.', 'warning')); draw(); }
}, 1000);
poll(); setInterval(poll, 1500);
