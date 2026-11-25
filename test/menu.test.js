import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMenus } from '../src/parser.js';
import { validateTranslations } from '../src/validation.js';
import { formatMenu } from '../src/format.js';
import { scrape } from '../src/scraper.js';

const sections = [
  { heading: 'Mathilda', items: ['Erikoisannos:\nKana\nRiisi', 'Suljettu'] },
  { heading: 'Café Oskar', items: ['Päivän keitto:\nKalakeitto'] },
  { heading: 'Alere', items: ['Suljettu'] },
  { heading: 'Cafe\u0301 Alere', items: ['Suljettu tai ei listaa saatavilla klo 07:00'] }
];

test('separates restaurants, protects real meals and distinguishes statuses', () => {
  const menus = parseMenus([{ sections }, { error: 'timeout' }]);
  assert.deepEqual(menus.slice(0, 5).map(menu => menu.status),
    ['available', 'available', 'scrape_error', 'closed', 'ambiguous']);
  assert.equal(parseMenus([{ sections }])[2].status, 'unavailable');
  assert.throws(() => parseMenus([{ sections }, { sections }]), /Duplicate/);
});

test('validates individual meals and preserves WhatsApp layout', () => {
  const menus = parseMenus([{ sections }]);
  const meals = menus.flatMap(menu => menu.meals);
  const entries = [{ id: '1.1', text: 'Chicken + rice' }, { id: '2.1', text: 'Fish soup' }];
  const message = formatMenu('2026-11-25', menus, validateTranslations(meals, { meals: entries }));
  assert.match(message, /^🍽️ SCHOOL LUNCH — 2026-11-25\n\n🏫 MATHILDA\n⭐ SPECIAL LUNCH: Chicken \+ rice\n\n🏫 CAFÉ OSKAR\n🥣 Fish soup/u);
  for (const invalid of [[], [entries[0], entries[0]], [entries[0], { id: '2.1', text: 'CLOSED' }],
    [entries[0], { id: '2.1', text: 'Soup (G, L)' }]]) {
    assert.throws(() => validateTranslations(meals, { meals: invalid }));
  }
});

test('scraper retries three times with increasing delays', async () => {
  let attempts = 0;
  const waits = [];
  const result = await scrape({ name: 'Kurnii' }, { date: '2026-11-25', weekday: 'wednesday' }, {
    launch: async () => { attempts++; throw new Error('offline'); },
    wait: async delay => waits.push(delay)
  });
  assert.equal(result.error, 'offline');
  assert.equal(attempts, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
});


// Representative Kurnii cards include multi-line meals and separate service notices.
test('parses lunch content and excludes out-of-hours services and offers before translation', () => {
  const menus = parseMenus([{ sections: [
    { heading: 'Mathilda', items: [
      'Kasvislounas:\nPinaattipihvi\nPerunat\nTillikastike',
      'Päivällinen 14.30-17.00:\nCafe Oscarissa kotiruoka ja kasvisruoka.',
      'Hävikkiruoka:\nOsta annos kotiin.',
      'Salaattilounas: Tofusalaatti',
      'Promotion: Try our loyalty card',
      'Price includes a container',
      'Takeaway leftover offer: Chicken',
      'Jälkiruoka:\nPannukakku\nHilloa\n16.00–16.15 Auta meitä vähentämään ruokahävikkiä'
    ] },
    { heading: 'Café Oskar', items: ['Päivän keitto: Lihakeittoa', 'Leipäateria: Juustoleipä'] },
    { heading: 'Alere', items: ['Evening meal: Soup'] },
    { heading: 'Cotton Club', items: ['Nakkikeitto', 'Suklaamousse', 'Broilerinfileetä'] }
  ] }]);
  assert.deepEqual(menus[0].meals.map(({ emoji, source }) => [emoji, source]), [
    ['🌱', 'Pinaattipihvi\nPerunat\nTillikastike'],
    ['🥗', 'Tofusalaatti'],
    ['🍰', 'Pannukakku\nHilloa']
  ]);
  assert.deepEqual(menus[1].meals.map(({ emoji, source }) => [emoji, source]),
    [['🥣', 'Lihakeittoa'], ['🥪', 'Juustoleipä']]);
  assert.equal(menus.find(({ name }) => name === 'ALERE').status, 'unavailable');
  assert.deepEqual(menus.at(-1).meals.map(({ emoji }) => emoji), ['🥣', '🍰', '🍽️']);
});

test('formats all eight sections and strips redundant labels and dish aliases', () => {
  const menus = parseMenus([{ sections: [
    { heading: 'Mathilda', items: ['Erikoisannos: Broileria vihreässä currykastikkeessa - Green Curry',
      'Kotiruokalounas: Kanaa', 'Kasvislounas: Linssipata'] },
    { heading: 'Café Oskar', items: ['Päivän keitto: Lohikeitto', 'Leipäateria: Juustoleipä'] },
    { heading: 'Café Alere', items: ['Salaattilounas: Tofusalaatti'] },
    { heading: 'Restaurang W33', items: ['Lounas: Kala', 'Kalakeitto'] }
  ] }]);
  const translated = new Map([
    ['1.1', 'SPECIAL LUNCH: Special dish: Chicken in green curry sauce - Green Curry + rice'],
    ['1.2', 'Home-cooked lunch: Chicken - lemon and herb dressing + potatoes'],
    ['1.3', 'Vegetarian lunch: Lentil stew'],
    ['2.1', 'Soup of the day: Salmon soup'],
    ['2.2', 'Bread meal: Cheese sandwich'],
    ['5.1', 'Salad lunch: Tofu salad'],
    ['7.1', 'Lunch: Fried fish + dill sauce'],
    ['7.2', 'Fish soup']
  ]);
  const message = formatMenu('2026-11-25', menus, translated);
  assert.deepEqual(message.split('\n').filter(line => line.startsWith('🏫 ')), [
    '🏫 MATHILDA', '🏫 CAFÉ OSKAR', '🏫 SERVERI', '🏫 ALERE', '🏫 CAFÉ ALERE',
    '🏫 FABRIIKKI', '🏫 W33', '🏫 COTTON CLUB'
  ]);
  assert.deepEqual(message.split('\n').filter(line => /^(?:⭐|🍲|🌱|🥣|🥪|🥗|🍽️ Fried fish)/u.test(line)), [
    '⭐ SPECIAL LUNCH: Chicken in green curry sauce + rice',
    '🍲 Chicken - lemon and herb dressing + potatoes',
    '🌱 Lentil stew', '🥣 Salmon soup', '🥪 Cheese sandwich', '🥗 Tofu salad',
    '🍽️ Fried fish + dill sauce', '🥣 Fish soup'
  ]);
  assert.throws(() => validateTranslations([{ id: '1.1' }], { meals: [{ id: '1.1', text: 'Lunch:' }] }),
    /Invalid meal translation/);
});

