import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
import { TZ } from './clock.js';

// Kurnii serves one panel per weekday. Wait for the panel and populated cards.
export async function readPanel(page, weekday) {
  const panel = page.locator(`#lists > #${weekday}`);
  await page.waitForFunction(day => {
    const cards = [...document.querySelectorAll(`#lists > #${day} > .list`)];
    return cards.length > 0 && cards.every(card =>
      card.querySelector('.list-title')?.textContent.trim() &&
      [...card.querySelectorAll('.list-item')].some(item => item.textContent.trim()));
  }, weekday, { timeout: 10000 });

  return panel.locator(':scope > .list').evaluateAll(cards => cards.map(card => ({
    heading: card.querySelector('.list-title').textContent.trim(),
    href: card.querySelector('.list-title').getAttribute('onclick'),
    items: [...card.querySelectorAll('.list-item')].map(item =>
      [...item.childNodes].map(node => node.nodeName === 'BR' ? '\n' : node.textContent).join('').trim())
  })));
}

// Retry transient fetch failures with bounded backoff and close each browser.
export async function scrape(source, { date, weekday, monday }, {
  launch = () => chromium.launch({ headless: true }), wait = sleep, log = () => {}
} = {}) {
  let error;
  for (const delay of [0, 1000, 2000, 4000]) {
    if (delay) await wait(delay);
    let browser;
    try {
      browser = await launch();
      const page = await browser.newPage({ locale: 'fi-FI', timezoneId: TZ });
      const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response?.ok()) throw new Error(`Kurnii HTTP status ${response?.status()}`);
      const sections = await readPanel(page, weekday);
      const week = publishedWeek(sections);
      if (week !== monday) {
        log('source_week_unverified', { date, source: source.name, expectedWeek: monday, publishedWeek: week });
        return { date, source: source.name, unavailable: 'unverified_week', observedSections: sections };
      }
      return { date, source: source.name, sections };
    } catch (cause) {
      error = cause.message;
      log('scrape_attempt_failed', { date, source: source.name, delay, error });
    } finally {
      await browser?.close();
    }
  }
  return { date, source: source.name, error };
}

// Kurnii repeats Fabriikki's week-start link in all seven weekday panels.
export function publishedWeek(sections) {
  const card = sections.find(section => section.heading === 'Ravintola Fabriikki');
  return card?.href?.match(/[?&]date=(\d{4}-\d{2}-\d{2})(?=['"&\s]|$)/)?.[1] ?? null;
}
