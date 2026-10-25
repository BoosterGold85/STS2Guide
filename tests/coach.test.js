import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalize, normalizeMap } from '../backend/app/game/browser_adapter.js';
import { advise, enumerateRoutes, scoreRoute } from '../frontend/coach.js';
const fixture = JSON.parse(fs.readFileSync(new URL('../frontend/demo.json', import.meta.url)));
const raw = () => structuredClone(fixture);
const player = { hp: 70, maxHp: 80, gold: 100, potionCount: 1 };
const node = (id, type) => ({ id, type, children: [] });

test('normalizes the new bridge graph and character', () => {
  const state = normalize(raw());
  assert.equal(state.players[0].hp, 46); assert.equal(state.map.nodes.length, 21);
  assert.equal(state.map.nextIds.length, 3); assert.equal(state.saveProfile, 'modded');
});
test('enumerates only selectable paths, deterministically', () => {
  const state = normalize(raw()); const routes = enumerateRoutes(state.map, 6);
  assert.ok(routes.length > 20);
  assert.deepEqual(routes, enumerateRoutes(state.map, 6));
  for (const route of routes) {
    assert.ok(state.map.nextIds.includes(route[0].id)); assert.equal(route.length, 6);
    route.slice(1).forEach((n, i) => assert.ok(route[i].children.includes(n.id)));
  }
});
test('limits lookahead and refuses path explosion instead of silently truncating', () => {
  const state = normalize(raw());
  assert.throws(() => enumerateRoutes(state.map, 0));
  assert.throws(() => enumerateRoutes(state.map, 6, 2), /Too many/);
});
test('blocked choices produce no routes', () => {
  const state = normalize(raw()); state.map.ready = false;
  assert.deepEqual(enumerateRoutes(state.map), []); assert.ok(advise(state).blocked);
});
test('unfinished map disables advice without losing HP stats', () => {
  const value = raw(); value.map.nodes[0].children.push('99:99');
  const state = normalize(value); assert.equal(state.players[0].hp, 46);
  assert.equal(state.map, null); assert.match(advise(state).blocked, /Incomplete/);
});
test('cycle, duplicates, unknown node types and unknown choices fail closed', () => {
  for (const mutate of [
    m => m.nodes.at(-1).children.push('1:0'),
    m => m.nodes.push(m.nodes[0]),
    m => m.nodes[0].type = 'NewPatchRoom',
    m => m.reachable_now_ids.push('88:88')
  ]) {
    const value = raw(); mutate(value.map); assert.equal(normalize(value).map, null);
  }
});
test('no active run clears advice', () => {
  const value = raw(); Object.assign(value, { active: false, is_multiplayer: null, players: [], act: null, floor: null, ascension: null, map: null });
  assert.equal(advise(normalize(value)).strategies.length, 0);
});
test('co-op remains explicitly disabled even with a complete roster', () => {
  const value = raw(); value.is_multiplayer = true; value.players.push({ ...value.players[0], slot: 1 });
  assert.match(advise(normalize(value)).blocked, /Co-op/);
});
test('unmatched game build and old bridge cannot produce advice', () => {
  const value = raw(); value.compatibility = 'unsupported_game_build';
  assert.match(advise(normalize(value)).blocked, /unsupported/);
  value.bridge_version = '0.0.1-prototype'; assert.throws(() => normalize(value), /Update/);
});
test('malformed player and numeric values are rejected', () => {
  for (const [field, value] of [['current_hp', 900], ['gold', true], ['max_hp', 0]]) {
    const data = raw(); data.players[0][field] = value; assert.throws(() => normalize(data));
  }
});
test('unknown optional fields do not break the adapter', () => {
  const value = raw(); value.future = { optional: true }; assert.equal(normalize(value).players.length, 1);
});
test('safe mode favors recovery over an elite for low HP', () => {
  const low = { ...player, hp: 20 };
  assert.ok(scoreRoute([node('rest', 'rest')], low, 'safe').score > scoreRoute([node('elite', 'elite')], low, 'safe').score);
});
test('campfire before elite is better than after at low HP', () => {
  const low = { ...player, hp: 17 };
  assert.ok(scoreRoute([node('r', 'rest'), node('e', 'elite')], low).rawValue > scoreRoute([node('e', 'elite'), node('r', 'rest')], low).rawValue);
});
test('safe mode penalizes two elites more than aggressive mode', () => {
  const route = [node('1', 'elite'), node('2', 'elite')];
  assert.ok(scoreRoute(route, player, 'safe').score < scoreRoute(route, player, 'aggressive').score);
  assert.ok(scoreRoute(route, player, 'safe').warnings.some(w => w.includes('2 elites')));
});
test('aggressive mode can favor an elite for a healthy player', () => {
  assert.ok(scoreRoute([node('e', 'elite')], player, 'aggressive').score > scoreRoute([node('f', 'fight')], player, 'aggressive').score);
});
test('shop value increases with available gold', () => {
  const route = [node('shop', 'shop')];
  assert.ok(scoreRoute(route, { ...player, gold: 200 }).score > scoreRoute(route, { ...player, gold: 30 }).score);
});
test('shop after a fight can benefit from estimated earnings', () => {
  const shop = node('s', 'shop'), fight = node('f', 'fight'), poor = { ...player, gold: 140 };
  assert.ok(scoreRoute([fight, shop], poor).score > scoreRoute([shop, fight], poor).score);
});
test('empty HP budget is explicitly warned and risk is high', () => {
  const score = scoreRoute([node('e', 'elite')], { ...player, hp: 5 });
  assert.equal(score.risk, 'High'); assert.ok(score.warnings.some(w => w.includes('runs out')));
});
test('scores are finite, bounded and explain their components', () => {
  const response = advise(normalize(raw())); assert.equal(response.strategies.length, 3);
  for (const strategy of response.strategies) {
    assert.ok(strategy.score >= 0 && strategy.score <= 100); assert.ok(Number.isFinite(strategy.rawValue));
    assert.equal(strategy.components.length, strategy.ids.length); assert.ok(strategy.reasons.length);
  }
});
test('route evaluation does not modify normalized state', () => {
  const state = normalize(raw()), before = structuredClone(state); advise(state); assert.deepEqual(state, before);
});

test('multiple shops cannot spend the same estimated budget twice', () => {
  const route = [node('s1', 'shop'), node('s2', 'shop')];
  const score = scoreRoute(route, { ...player, gold: 150 });
  assert.ok(score.components[1].value < score.components[0].value);
  assert.equal(score.reasons.filter(r => r.includes('fits the estimated gold budget')).length, 1);
});
test('unassigned next rooms fail closed instead of becoming free rewards', () => {
  const value = raw(); value.map.nodes[1].type = 'Unassigned';
  assert.equal(normalize(value).map, null);
});
