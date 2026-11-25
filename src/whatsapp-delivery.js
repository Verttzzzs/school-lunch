import pkg from 'whatsapp-web.js';

const { ACK_ERROR, ACK_SERVER } = pkg.MessageAck;

// Verify the exact configured chat and match the signed-in account's phone or LID.
export async function verifyGroupMembership(client, groupId) {
  const chat = await client.getChatById(groupId);
  if (!chat?.isGroup || chat.id?._serialized !== groupId) {
    throw new Error('Configured WhatsApp group did not resolve to the exact group ID');
  }
  const accountId = client.info?.wid?._serialized;
  const participants = chat.participants;
  if (!accountId || !Array.isArray(participants)) {
    throw new Error('WhatsApp account or group participant data is unavailable');
  }
  const memberIds = new Set(participants.map(participant => participant.id?._serialized).filter(Boolean));
  if (!memberIds.has(accountId)) {
    const aliases = await client.getContactLidAndPhone?.([accountId]);
    if (!aliases?.some(({ lid, pn }) => memberIds.has(lid) || memberIds.has(pn))) {
      throw new Error('Could not verify that the authenticated WhatsApp account is a member of the configured group');
    }
  }
  return { groupId, groupName: chat.name };
}

// Listen before sending because the ACK can arrive before sendMessage resolves.
export async function sendWithConfirmation(client, groupId, body, log, timeoutMs = 30000) {
  let messageId;
  let lastAck;
  let timer;
  let finished = false;
  const earlyAcks = new Map();
  let signalAck;
  const ackReceived = new Promise(resolve => { signalAck = resolve; });

  function onAck(message, ack) {
    if (message?.fromMe !== true || message.to !== groupId) return;
    const id = message.id?._serialized;
    if (!id) return;
    if (!messageId) earlyAcks.set(id, ack);
    else if (id === messageId) {
      lastAck = ack;
      if (ack === ACK_ERROR || ack >= ACK_SERVER) signalAck(ack);
    }
  }

  let onDisconnect;
  try {
    log('whatsapp_group_verified', await verifyGroupMembership(client, groupId));
    const deadline = new Promise((_, reject) => {
      onDisconnect = () => reject(new Error('WhatsApp disconnected before server acknowledgement'));
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms waiting for WhatsApp server acknowledgement`)), timeoutMs);
    });

    client.on('message_ack', onAck);
    client.once('disconnected', onDisconnect);
    const send = async () => {
      const message = await client.sendMessage(groupId, body);
      if (finished) return;
      if (!message?.id?._serialized || message.fromMe !== true || message.to !== groupId) {
        throw new Error('WhatsApp did not return a matching outgoing message ID');
      }
      messageId = message.id._serialized;
      const earlyAck = earlyAcks.get(messageId);
      lastAck = earlyAck === ACK_ERROR || message.ack === ACK_ERROR
        ? ACK_ERROR : Math.max(earlyAck ?? 0, message.ack ?? 0);
      log('whatsapp_message_submitted', { groupId, messageId, ack: lastAck ?? null });
      const ack = lastAck === ACK_ERROR || lastAck >= ACK_SERVER ? lastAck : await ackReceived;
      if (ack === ACK_ERROR) throw new Error('WhatsApp rejected the outgoing message (ACK_ERROR)');
      return { messageId, ack };
    };
    const result = await Promise.race([send(), deadline]);
    log('whatsapp_server_acknowledged', { groupId, ...result });
    return result;
  } catch (error) {
    log('whatsapp_delivery_unconfirmed', { groupId, messageId: messageId ?? null,
      ack: lastAck ?? null, error: error.message });
    throw error;
  } finally {
    finished = true;
    clearTimeout(timer);
    client.off('message_ack', onAck);
    if (onDisconnect) client.off('disconnected', onDisconnect);
  }
}
