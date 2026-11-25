import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMode, runManualSend } from '../src/cli.js';

const env = { WHATSAPP_GROUP_ID: '100@g.us', WHATSAPP_PLAYGROUND_GROUP_ID: '200@g.us' };

function setup() {
  const calls = [];
  const options = {
    env, now: () => new Date('2026-11-29T22:00:00Z'), log: () => {},
    createClient() {
      calls.push('client');
      return {
        connectOnce: async () => calls.push('ready'),
        isReady: () => true,
        send: async (group, body) => calls.push(['send', group, body]),
        close: async () => calls.push('close')
      };
    },
    createState() { throw new Error('Playground must never open production state'); },
    menu: { getMenu: async (date, mode) => {
      calls.push(['menu', date, mode]);
      return { status: 'ready', body: 'Mock English menu' };
    } }
  };
  return { calls, options };
}

test('CLI explicitly routes modes and rejects conflicting and unknown options', () => {
  assert.equal(parseMode([]), 'scheduled-production');
  for (const flag of ['test-send', 'send-production']) assert.equal(parseMode(['--' + flag]), flag);
  assert.equal(parseMode(['--dry-run']), 'preview');
  assert.equal(parseMode(['--list-groups']), 'groups');
  assert.throws(() => parseMode(['--test-send', '--send-production']));
  assert.throws(() => parseMode(['--test-sned']));
});

test('test-send sends once to playground after readiness and closes without using state', async () => {
  const { calls, options } = setup();
  await runManualSend('test-send', options);
  assert.deepEqual(calls, ['client', 'ready', ['menu', '2026-11-30', 'test-send'],
    ['send', '200@g.us', 'Mock English menu'], 'close']);
});

test('missing or matching playground ID rejects before starting a client', async () => {
  for (const playground of [undefined, '100@g.us']) {
    const { calls, options } = setup();
    options.env = { ...env, WHATSAPP_PLAYGROUND_GROUP_ID: playground };
    await assert.rejects(runManualSend('test-send', options), /PLAYGROUND_GROUP_ID|differ/);
    assert.deepEqual(calls, []);
  }
});

test('manual production sends and records once using normal production state', async () => {
  const { calls, options } = setup();
  options.createState = legacyGroup => {
    assert.equal(legacyGroup, '100@g.us');
    return {
      status: async () => null,
      claim: async (date, group) => { calls.push(['claim', date, group]); return true; },
      sent: async (date, group) => calls.push(['sent', date, group])
    };
  };
  await runManualSend('send-production', options);
  assert.deepEqual(calls.slice(-4), [['claim', '2026-11-30', '100@g.us'],
    ['send', '100@g.us', 'Mock English menu'], ['sent', '2026-11-30', '100@g.us'], 'close']);
  options.createState = () => ({ status: async () => 'sent' });
  calls.length = 0;
  await runManualSend('send-production', options);
  assert.deepEqual(calls, ['client', 'ready', 'close']);
});

test('manual send closes the client when a menu cannot be prepared', async () => {
  const { calls, options } = setup();
  options.menu.getMenu = async () => ({ status: 'unavailable' });
  await assert.rejects(runManualSend('test-send', options), /No verified menu/);
  assert.deepEqual(calls, ['client', 'ready', 'close']);
});
