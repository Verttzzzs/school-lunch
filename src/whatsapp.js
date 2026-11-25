import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { existsSync } from 'node:fs';
import { sendWithConfirmation, verifyGroupMembership } from './whatsapp-delivery.js';

const { Client, LocalAuth } = pkg;
const legacyChrome = 'C:\\Users\\Verttzzz\\.cache\\puppeteer\\chrome\\win64-154.0.8037.57\\chrome-win64\\chrome.exe';

// Select one destination. The existing group variable remains the production default.
export function resolveGroups(env, playground) {
  const productionGroup = (env.WHATSAPP_PRODUCTION_GROUP_ID || env.WHATSAPP_GROUP_ID)?.trim();
  const group = playground ? env.WHATSAPP_PLAYGROUND_GROUP_ID?.trim() : productionGroup;
  if (!/^\d+(?:-\d+)?@g\.us$/.test(group ?? '')) {
    throw new Error(playground ? 'Configure WHATSAPP_PLAYGROUND_GROUP_ID' : 'Configure WHATSAPP_GROUP_ID or WHATSAPP_PRODUCTION_GROUP_ID');
  }
  if (playground && [productionGroup, env.WHATSAPP_GROUP_ID?.trim()].includes(group)) {
    throw new Error('The playground group must differ from production');
  }
  return { group, productionGroup, legacyGroup: env.WHATSAPP_GROUP_ID?.trim() || productionGroup };
}

// Keep the original LocalAuth session identifier and allow a portable Chrome override.
export function createWhatsApp(log, env = process.env) {
  const executablePath = env.WHATSAPP_CHROME_PATH || (existsSync(legacyChrome) ? legacyChrome : undefined);
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'vocagpt' }),
    puppeteer: { headless: true, executablePath, args: ['--no-sandbox'], timeout: 120000 }
  });
  let ready = false;
  client.on('qr', code => {
    log('whatsapp_qr_required');
    qrcode.generate(code, { small: true });
  });
  client.on('authenticated', () => log('whatsapp_authenticated'));
  client.on('auth_failure', () => { ready = false; log('whatsapp_auth_failure'); });
  client.on('disconnected', reason => { ready = false; log('whatsapp_disconnected', { reason }); });
  client.on('ready', () => { ready = true; log('whatsapp_ready'); });

  return {
    isReady: () => ready,
    onReady: callback => client.on('ready', callback),
    start: () => client.initialize(),
    close: async () => {
      if (client.pupBrowser?.isConnected()) await client.destroy();
    },
    // One-shot modes must handle initialization errors and readiness failures.
    async connectOnce() {
      let timer;
      let onReady;
      let onFailure;
      const readiness = new Promise((resolve, reject) => {
        onReady = resolve;
        onFailure = () => reject(new Error('WhatsApp disconnected or authentication failed before readiness'));
        client.once('ready', onReady);
        client.once('auth_failure', onFailure);
        client.once('disconnected', onFailure);
        timer = setTimeout(() => reject(new Error('Timed out waiting for WhatsApp to connect')), 180000);
      });
      try {
        await Promise.all([readiness, client.initialize()]);
      } finally {
        clearTimeout(timer);
        client.off('ready', onReady);
        client.off('auth_failure', onFailure);
        client.off('disconnected', onFailure);
      }
    },
    send: (id, body) => sendWithConfirmation(client, id, body, log),
    verifyGroup: id => verifyGroupMembership(client, id),
    async listAndClose() {
      try {
        const chats = await client.getChats();
        for (const chat of chats.filter(chat => chat.isGroup)) console.log(`${chat.name} | ${chat.id._serialized}`);
      } finally {
        await client.destroy();
      }
    }
  };
}
