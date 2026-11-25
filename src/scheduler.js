import { helsinki } from './clock.js';

const weekdays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

export function canDeliver(local, immediate = false) {
  return weekdays.has(local.weekday) && (immediate || (local.minutes >= 420 && local.minutes < 720));
}

// The shared guard covers scheduled delivery, reconnect catch-up and the Monday probe.
export function createScheduler({ group, state, isReady, prepare, send, probe,
  now = () => new Date(), log = () => {} }) {
  let running = false;
  let deliveredDate;

  async function exclusive(task) {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      log('job_failed', { error: error.message });
    } finally {
      running = false;
    }
  }

  return {
    async tick({ immediate = false } = {}) {
      const local = helsinki(now());
      if (!isReady() || !canDeliver(local, immediate) || deliveredDate === local.date) return;
      await exclusive(async () => {
        const status = await state.status(local.date, group);
        if (status) {
          deliveredDate = local.date;
          log('delivery_skipped', { date: local.date, status });
          return;
        }

        const message = await prepare(local.date);
        const current = helsinki(now());
        if (!isReady() || current.date !== local.date || !canDeliver(current, immediate)) {
          log('delivery_window_changed', { date: local.date });
          return;
        }
        if (!(await state.claim(local.date, group))) return;
        deliveredDate = local.date;
        log('delivery_claimed', { date: local.date });
        await send(group, message);
        await state.sent(local.date, group);
        log('delivery_sent', { date: local.date });
      });
    },
    probe: () => exclusive(() => probe(helsinki(now()).date))
  };
}
