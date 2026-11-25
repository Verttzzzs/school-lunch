import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { helsinki } from '../src/clock.js';
import { canDeliver, createScheduler } from '../src/scheduler.js';
import { deliveryState } from '../src/delivery-state.js';

test('weekday Helsinki catch-up observes 07:00, noon, weekends and DST', () => {
  const eligible = stamp => canDeliver(helsinki(new Date(stamp)));
  assert.equal(eligible('2026-11-25T04:59:00Z'), false);
  assert.equal(eligible('2026-11-25T05:00:00Z'), true);
  assert.equal(eligible('2026-11-25T09:59:00Z'), true);
  assert.equal(eligible('2026-11-25T10:00:00Z'), false);
  assert.equal(eligible('2026-11-28T06:00:00Z'), false);
  assert.equal(eligible('2026-07-02T04:00:00Z'), true);
});

test('ready catch-up, concurrent triggers and restarts send once', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vocagpt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const group = 'mock@g.us';
  let ready = false;
  let prepared = 0;
  let sends = 0;
  const state = () => deliveryState(join(root, 'state'), join(root, 'legacy.json'), group);
  const make = () => createScheduler({
    group, state: state(), isReady: () => ready, now: () => new Date('2026-11-25T08:00:00Z'),
    prepare: async date => { prepared++; return date; },
    send: async (id, body) => { assert.equal(id, group); assert.equal(body, '2026-11-25'); sends++; },
    log: (event, details) => { if (event === 'job_failed') throw new Error(details.error); }
  });
  const scheduler = make();
  await scheduler.tick();
  assert.equal(prepared, 0);
  ready = true;
  await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);
  await make().tick();
  assert.equal(prepared, 1);
  assert.equal(sends, 1);
});

test('legacy production state and exclusive pending claims survive restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vocagpt-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = join(root, 'legacy.json');
  const date = '2026-11-25';
  await writeFile(legacy, JSON.stringify({ lastSent: date }));
  const state = deliveryState(join(root, 'state'), legacy, 'production@g.us');
  assert.equal(await state.status(date, 'production@g.us'), 'sent');
  assert.equal(await state.status(date, 'playground@g.us'), null);
  const claims = await Promise.all([state.claim(date, 'playground@g.us'), state.claim(date, 'playground@g.us')]);
  assert.deepEqual(claims.sort(), [false, true]);
  assert.equal(await state.status(date, 'playground@g.us'), 'pending');
});

test('a preparation failure can catch up but a lost send acknowledgement stays pending', async t => {
  const root = await mkdtemp(join(tmpdir(), 'vocagpt-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const group = 'mock@g.us';
  const state = deliveryState(join(root, 'state'), join(root, 'legacy.json'), group);
  let attempts = 0;
  let sends = 0;
  const make = () => createScheduler({
    group, state, isReady: () => true, now: () => new Date('2026-11-25T08:00:00Z'),
    prepare: async () => {
      if (++attempts === 1) throw new Error('temporary scraper failure');
      return 'Mock menu';
    },
    send: async () => { sends++; throw new Error('acknowledgement lost'); }
  });
  const scheduler = make();
  await scheduler.tick();
  assert.equal(await state.status('2026-11-25', group), null);
  await scheduler.tick();
  assert.equal(await state.status('2026-11-25', group), 'pending');
  await make().tick();
  assert.equal(attempts, 2);
  assert.equal(sends, 1);
});
