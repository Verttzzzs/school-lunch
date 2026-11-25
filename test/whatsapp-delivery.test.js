import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendWithConfirmation } from '../src/whatsapp-delivery.js';
import { runManualSend } from '../src/cli.js';

const groupId = '200@g.us';
const outgoing = (id = 'outgoing', ack = 0) => ({ id: { _serialized: id }, to: groupId, fromMe: true, ack });
function setup() {
  const client = new EventEmitter();
  const events = [];
  client.info = { wid: { _serialized: 'account@c.us' } };
  client.getChatById = async id => {
    assert.equal(id, groupId);
    return { isGroup: true, id: { _serialized: groupId }, name: 'Playground',
      participants: [{ id: { _serialized: 'account@lid' } }] };
  };
  client.getContactLidAndPhone = async () => [{ lid: 'account@lid' }];
  const log = (event, details) => events.push({ event, ...details });
  return { client, events, log };
}

test('captures an early server acknowledgement and logs the matching message', async () => {
  const { client, events, log } = setup();
  client.sendMessage = async (id, body) => {
    assert.equal(id, groupId);
    assert.equal(body, 'Mock menu');
    client.emit('message_ack', outgoing(), 1);
    return outgoing();
  };
  assert.deepEqual(await sendWithConfirmation(client, groupId, 'Mock menu', log),
    { messageId: 'outgoing', ack: 1 });
  assert.deepEqual(events.map(event => event.event),
    ['whatsapp_group_verified', 'whatsapp_message_submitted', 'whatsapp_server_acknowledged']);
  assert.equal(client.listenerCount('message_ack'), 0);
});

test('pending, unrelated and rejected acknowledgements cannot report success', async () => {
  for (const rejected of [false, true]) {
    const { client, events, log } = setup();
    client.sendMessage = async () => {
      client.emit('message_ack', outgoing('other'), 3);
      if (rejected) client.emit('message_ack', outgoing(), -1);
      return outgoing();
    };
    await assert.rejects(sendWithConfirmation(client, groupId, 'Mock menu', log, 20),
      rejected ? /ACK_ERROR/ : /Timed out/);
    assert.equal(events.at(-1).event, 'whatsapp_delivery_unconfirmed');
    assert.equal(events.at(-1).messageId, 'outgoing');
    assert.equal(client.listenerCount('message_ack'), 0);
  }
});

test('refuses a different chat or an account outside the group before sending', async () => {
  const { client, log } = setup();
  client.sendMessage = async () => assert.fail('Unexpected send');
  client.getContactLidAndPhone = async () => [];
  await assert.rejects(sendWithConfirmation(client, groupId, '', log), /member/);
  client.getChatById = async () => ({ isGroup: true, id: { _serialized: '300@g.us' } });
  await assert.rejects(sendWithConfirmation(client, groupId, '', log), /exact group ID/);
});

test('one-shot client remains open until the matching server acknowledgement', async () => {
  const { client, events, log } = setup();
  let submitted;
  const started = new Promise(resolve => { submitted = resolve; });
  let closed = false;
  client.sendMessage = async () => { submitted(); return outgoing(); };
  const result = runManualSend('test-send', {
    env: { WHATSAPP_PLAYGROUND_GROUP_ID: groupId }, log,
    createClient: () => ({
      connectOnce: async () => {}, isReady: () => true,
      send: (id, body) => sendWithConfirmation(client, id, body, log, 1000),
      close: async () => { closed = true; }
    }),
    menu: { getMenu: async () => ({ status: 'ready', body: 'Mock menu' }) }
  });
  await started;
  assert.equal(closed, false);
  assert.equal(events.some(({ event }) => event === 'manual_delivery_sent'), false);
  client.emit('message_ack', outgoing(), 1);
  await result;
  assert.equal(closed, true);
  assert.equal(events.at(-1).event, 'manual_delivery_sent');
});
