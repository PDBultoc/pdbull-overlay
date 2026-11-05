import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingSeconds, formatCountdown, countdownState, countdownView } from '../core/countdown.js';

test('remainingSeconds: null/invalid end gives null', () => {
  assert.equal(remainingSeconds(null, 1000), null);
  assert.equal(remainingSeconds(undefined, 1000), null);
  assert.equal(remainingSeconds('x', 1000), null);
  assert.equal(remainingSeconds(NaN, 1000), null);
});

test('remainingSeconds: seconds between now and end, may go negative', () => {
  assert.equal(remainingSeconds(301000, 1000), 300);
  assert.equal(remainingSeconds(1000, 1000), 0);
  assert.equal(remainingSeconds(500, 1000), -0.5);
});

test('formatCountdown: m:ss, rounds up, clamps at 0:00', () => {
  assert.equal(formatCountdown(300), '5:00');
  assert.equal(formatCountdown(299.2), '5:00');
  assert.equal(formatCountdown(59), '0:59');
  assert.equal(formatCountdown(61), '1:01');
  assert.equal(formatCountdown(9.01), '0:10');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-5), '0:00');
  assert.equal(formatCountdown(3599), '59:59');
  assert.equal(formatCountdown(6000), '100:00');
  assert.equal(formatCountdown(null), '');
});

test('countdownState: soon / counting / now', () => {
  assert.equal(countdownState(null, 1000), 'soon');
  assert.equal(countdownState(undefined, 1000), 'soon');
  assert.equal(countdownState(2000, 1000), 'counting');
  assert.equal(countdownState(1001, 1000), 'counting');
  assert.equal(countdownState(1000, 1000), 'now');
  assert.equal(countdownState(500, 1000), 'now');
});

test('countdownView: state, text and wax fraction in one object', () => {
  assert.deepEqual(countdownView(null, 0, 300), { state: 'soon', text: '', frac: 1 });
  assert.deepEqual(countdownView(151000, 1000, 300), { state: 'counting', text: '2:30', frac: 0.5 });
  assert.deepEqual(countdownView(1000, 1000, 300), { state: 'now', text: '0:00', frac: 0 });
  // a late end (longer than the nominal total) never gives a fraction above 1
  assert.equal(countdownView(1000 + 900000, 1000, 300).frac, 1);
});
