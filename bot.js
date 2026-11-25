// CLI entry point. Preview mode never instantiates WhatsApp; group listing never schedules delivery.
import 'dotenv/config';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { helsinki, TZ } from './src/clock.js';
import { createLogging } from './src/logging.js';
import { createMenuService } from './src/menu-service.js';
import { createScheduler } from './src/scheduler.js';
import { deliveryState } from './src/delivery-state.js';
import { createWhatsApp, resolveGroups } from './src/whatsapp.js';
import { parseMode, runManualSend } from './src/cli.js';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const createState = legacyGroup => deliveryState(path('./delivery-state/'), path('./sent-state.json'), legacyGroup);
const { log, artifacts } = createLogging(path('./logs/'));

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === 'groups') {
    const whatsapp = createWhatsApp(log);
    whatsapp.onReady(() => {
      whatsapp.listAndClose().catch(error => {
        log('group_listing_failed', { error: error.message });
        process.exitCode = 1;
      });
    });
    await whatsapp.start();
    return;
  }

  const sources = JSON.parse(await fs.readFile(path('./restaurants.json'), 'utf8'));
  const menu = createMenuService({ sources, log, artifacts });
  if (mode === 'preview') {
    const { date, weekday } = helsinki();
    if (['Sat', 'Sun'].includes(weekday)) {
      console.log('Weekend detected. Skipping.');
      return;
    }
    const result = await menu.getMenu(date);
    if (result.status !== 'ready') throw new Error('No verified menu for today');
    console.log('\n--- MENU PREVIEW ---\n\n' + result.body);
    return;
  }

  if (mode === 'test-send' || mode === 'send-production') {
    await runManualSend(mode, { env: process.env, createClient: () => createWhatsApp(log),
      createState, menu, log });
    return;
  }

  const playground = mode === 'scheduled-playground';
  const { group, legacyGroup } = resolveGroups(process.env, playground);
  const whatsapp = createWhatsApp(log);
  const state = createState(legacyGroup);
  const scheduler = createScheduler({ group, state, isReady: whatsapp.isReady,
    prepare: menu.prepareDelivery, send: whatsapp.send, probe: menu.probe, log });

  // A minute tick covers 07:00 and the catch-up window, including reconnections.
  let firstReady = true;
  whatsapp.onReady(() => {
    const immediate = firstReady && process.env.SEND_ON_START?.trim().toLowerCase() === 'true';
    firstReady = false;
    return scheduler.tick({ immediate });
  });
  await whatsapp.start();
  cron.schedule('* * * * 1-5', () => scheduler.tick(), { timezone: TZ });
  cron.schedule('0 1 * * 1', () => scheduler.probe(), { timezone: TZ });
  setInterval(() => log('heartbeat', { whatsappReady: whatsapp.isReady() }), 5 * 60 * 1000);
  log('scheduler_started', { timezone: TZ, destination: playground ? 'playground' : 'production' });
}

try {
  await main();
} catch (error) {
  log('bot_failed', { error: error.message });
  process.exitCode = 1;
}
