import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGroups } from '../src/whatsapp.js';

test('production honors the legacy ID and playground requires its own destination', () => {
  const env = { WHATSAPP_GROUP_ID: '100@g.us', WHATSAPP_PLAYGROUND_GROUP_ID: '200@g.us' };
  assert.equal(resolveGroups(env, false).group, '100@g.us');
  assert.equal(resolveGroups(env, true).group, '200@g.us');
  const override = { ...env, WHATSAPP_PRODUCTION_GROUP_ID: '300@g.us' };
  assert.equal(resolveGroups(override, false).group, '300@g.us');
  assert.equal(resolveGroups(override, false).legacyGroup, '100@g.us');
  assert.throws(() => resolveGroups({ WHATSAPP_GROUP_ID: '100@g.us' }, true), /PLAYGROUND_GROUP_ID/);
  assert.throws(() => resolveGroups({ ...env, WHATSAPP_PLAYGROUND_GROUP_ID: '100@g.us' }, true), /differ/);
});
