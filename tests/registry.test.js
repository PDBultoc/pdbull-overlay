import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, modulesFor } from '../core/registry.js';
test('casting scene mounts camchat, alerts and reactions only', () => {
  assert.deepEqual(modulesFor('casting'), ['camchat', 'alerts', 'reactions']);
  assert.deepEqual(modulesFor(''), MODULES);
  assert.ok(!MODULES.includes('reactions'));
});
