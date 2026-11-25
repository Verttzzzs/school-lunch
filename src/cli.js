import { helsinki } from './clock.js';
import { resolveGroups } from './whatsapp.js';

const modes = new Map([
  ['--dry-run', 'preview'], ['--test-send', 'test-send'],
  ['--send-production', 'send-production'], ['--list-groups', 'groups'],
  ['--playground', 'scheduled-playground']
]);

// Reject ambiguous or misspelled modes before opening a WhatsApp session.
export function parseMode(args) {
  if (!args.length) return 'scheduled-production';
  if (args.length !== 1 || !modes.has(args[0])) {
    throw new Error('Choose one mode: --dry-run, --test-send, --send-production, --list-groups or --playground');
  }
  return modes.get(args[0]);
}

// Manual delivery waits for readiness and closes the browser after any outcome.
export async function runManualSend(mode, { env, createClient, createState, menu, log, now = () => new Date() }) {
  const playground = mode === 'test-send';
  const { group, legacyGroup } = resolveGroups(env, playground);
  const state = playground ? null : createState(legacyGroup);
  const whatsapp = createClient();
  const destination = playground ? 'playground' : 'production';

  try {
    await whatsapp.connectOnce();
    const { date } = helsinki(now());
    const status = await state?.status(date, group);
    if (status) {
      log('manual_delivery_skipped', { date, destination, status });
      return;
    }

    const result = await menu.getMenu(date, mode);
    if (result.status !== 'ready') throw new Error('No verified menu for today');
    if (!whatsapp.isReady() || helsinki(now()).date !== date) {
      throw new Error('WhatsApp readiness or the Helsinki date changed before sending');
    }
    if (state && !(await state.claim(date, group))) {
      log('manual_delivery_skipped', { date, destination, status: 'already_claimed' });
      return;
    }
    await whatsapp.send(group, result.body);
    await state?.sent(date, group);
    log('manual_delivery_sent', { date, destination });
  } finally {
    await whatsapp.close();
  }
}
