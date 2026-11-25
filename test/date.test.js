import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelForDate } from '../src/clock.js';
import { publishedWeek } from '../src/scraper.js';
import { createMenuService } from '../src/menu-service.js';

test('date lookup maps the current Monday–Sunday week and rejects rollover or invalid dates', () => {
  assert.deepEqual(panelForDate('2026-11-26', '2026-11-25'),
    { date: '2026-11-26', weekday: 'thursday', monday: '2026-11-23' });
  assert.equal(panelForDate('2026-11-30', '2026-11-29'), null);
  assert.equal(panelForDate('2026-02-30', '2026-02-28'), null);
  assert.equal(panelForDate('2027-01-01', '2026-12-31').monday, '2026-12-28');
});

test('published week uses the Fabriikki link date', () => {
  assert.equal(publishedWeek([{ heading: 'Ravintola Fabriikki',
    href: "openUrl('https://ravintolapalvelut.iss.fi/ravintola-fabriikki/?date=2026-11-23');" }]), '2026-11-23');
  assert.equal(publishedWeek([{ heading: 'Ravintola Fabriikki', href: 'no date' }]), null);
});

test('date service sends the requested panel to the scraper and never fetches the next week', async () => {
  const requests = [];
  const menu = createMenuService({
    sources: [{ name: 'Kurnii' }], log: () => {},
    artifacts: () => ({ raw: async () => {}, message: async () => {} }),
    now: () => new Date('2026-11-25T08:00:00Z'),
    fetchSource: async (_, request) => {
      requests.push(request);
      return { sections: [{ heading: 'Café Alere', items: ['Päivän keitto: Kalakeitto'] }] };
    },
    translate: async menus => new Map(menus.flatMap(m => m.meals).map(m => [m.id, 'Fish soup']))
  });
  const result = await menu.getMenu('2026-11-26');
  assert.equal(result.status, 'ready');
  assert.match(result.body, /CAFÉ ALERE\n🥣 Fish soup/u);
  assert.equal((await menu.getMenu('2026-11-30')).status, 'unavailable');
  assert.deepEqual(requests.map(request => request.weekday), ['thursday']);
});
