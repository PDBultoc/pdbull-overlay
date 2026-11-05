import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chatBottom, playerCount } from '../core/camchatlogic.js';
import { normalizeMatch } from '../core/aoe2.js';

test('chatBottom from player count', () => {
  assert.equal(chatBottom(2), 190);
  assert.equal(chatBottom(4), 238);
  assert.equal(chatBottom(8), 334);
  assert.equal(chatBottom(1), 190);
  assert.equal(chatBottom(9), 334);
  assert.equal(chatBottom(undefined), 190);
  assert.equal(chatBottom(NaN), 190);
});

test('playerCount: real 1v1 gives 2 -> 190, no match gives 2', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/pa100.json', import.meta.url), 'utf8'));
  const m = normalizeMatch(raw[0], 551021);
  assert.equal(playerCount(m), 2);
  assert.equal(chatBottom(playerCount(m)), 190);
  assert.equal(playerCount(null), 2);
});

test('playerCount: 4v4 synthetic gives 8 -> 334', () => {
  const side = () => [1, 2, 3, 4].map((i) => ({ profileId: i }));
  const m = { myTeam: side(), enemies: [side()] };
  assert.equal(playerCount(m), 8);
  assert.equal(chatBottom(playerCount(m)), 334);
});

import { emoteParts } from '../core/camchatlogic.js';
test('emoteParts splits text around Twitch emote ranges', () => {
  const p = emoteParts('hi Kappa yo', '25:3-7');
  assert.deepEqual(p, ['hi ', { e: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }, ' yo']);
  assert.deepEqual(emoteParts('plain', ''), ['plain']);
  assert.deepEqual(emoteParts('x', 'garbage'), ['x']);
});

test('mount adds the stylesheet link, the last unmount removes it again', async () => {
  const head = []; 
  const mk = () => ({ remove() { const i = head.indexOf(this); if (i >= 0) head.splice(i, 1); }, appendChild() {}, style: { setProperty() {} } });
  globalThis.document = {
    head: { appendChild: (e) => head.push(e) },
    getElementById: (id) => head.find((e) => e.id === id) || null,
    createElement: () => mk(),
  };
  try {
    const { mount } = await import('../modules/camchat.js');
    const a = mount(mk(), {}), b = mount(mk(), {});
    assert.equal(head.length, 1);   // one shared link
    a.unmount(); a.unmount();       // double unmount must not release twice
    assert.equal(head.length, 1);
    b.unmount();
    assert.equal(head.length, 0);
  } finally { delete globalThis.document; }
});
