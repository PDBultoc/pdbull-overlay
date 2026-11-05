import test from 'node:test';
import assert from 'node:assert/strict';
import { addLine, trimName, trimText, readableColor, MAX_NAME, MAX_TEXT } from '../core/brbchat.js';

test('trimName keeps 25 chars whole, cuts longer ones', () => {
  assert.equal(trimName('Extremely_Long_Name_25chr'), 'Extremely_Long_Name_25chr');
  assert.equal(trimName('x'.repeat(40)).length, MAX_NAME);
  assert.equal(trimName(null), '');
});
test('trimText collapses whitespace and caps with an ellipsis', () => {
  assert.equal(trimText('  a   b \n c '), 'a b c');
  const t = trimText('w'.repeat(500));
  assert.equal(t.length, MAX_TEXT);
  assert.ok(t.endsWith('…'));
});
test('addLine keeps only the last N lines, newest last', () => {
  let l = [];
  for (let i = 0; i < 5; i++) l = addLine(l, { user: 'u' + i, color: '#fff', text: 't' + i }, 3);
  assert.deepEqual(l.map((x) => x.user), ['u2', 'u3', 'u4']);
});
test('addLine ignores empty messages and does not mutate', () => {
  const a = [];
  assert.equal(addLine(a, { user: 'a', text: '   ' }, 3), a);
  const b = addLine(a, { user: 'a', text: 'hi' }, 3);
  assert.equal(a.length, 0); assert.equal(b.length, 1);
});
test('readableColor lifts dark/muted colours, leaves bright ones', () => {
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  assert.ok(lum(readableColor('#0000FF')) >= 120);
  assert.ok(lum(readableColor('#333333')) >= 120);
  assert.equal(readableColor('#FFD27F'), '#ffd27f');
  assert.ok(lum(readableColor('hsl(10, 70%, 65%)')) >= 120);
  assert.ok(lum(readableColor('garbage')) >= 120);
});
