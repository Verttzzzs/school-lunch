import { helsinki, panelForDate } from './clock.js';
import { scrape } from './scraper.js';
import { parseMenus } from './parser.js';
import { translateMenus } from './translation.js';
import { formatMenu } from './format.js';

// Date-based menus can be reused by future commands without creating a WhatsApp client.
export function createMenuService({ sources, artifacts, log, now = () => new Date(),
  fetchSource = scrape, translate = translateMenus }) {
  async function fetchMenus(date, kind) {
    const request = panelForDate(date, helsinki(now()).date);
    const debug = artifacts(date, kind);
    const pages = [];
    if (request) {
      for (const source of sources) pages.push(await fetchSource(source, request, { log }));
    }
    await debug.raw({ date, pages, reason: request ? undefined : 'outside_current_week' });
    return { pages, debug };
  }

  async function getMenu(date, kind = 'preview') {
    log('menu_preparation_started', { date, kind });
    const { pages, debug } = await fetchMenus(date, kind);
    if (!pages.length || pages.every(page => page.unavailable)) {
      return { date, status: 'unavailable' };
    }
    if (pages.every(page => page.error || page.unavailable)) {
      throw new Error('No menu source could be fetched and verified');
    }
    const menus = parseMenus(pages);
    if (!menus.some(menu => ['available', 'closed', 'ambiguous'].includes(menu.status))) {
      throw new Error('No recognizable menu cards');
    }
    const body = formatMenu(date, menus, await translate(menus));
    await debug.message(body);
    log('menu_prepared', { date, kind, meals: menus.reduce((count, menu) => count + menu.meals.length, 0) });
    return { date, status: 'ready', menus, body };
  }

  return {
    getMenu,
    async prepareDelivery(date) {
      const result = await getMenu(date, 'delivery');
      if (result.status !== 'ready') throw new Error('No verified menu for the delivery date');
      return result.body;
    },
    async probe(date) {
      const { pages } = await fetchMenus(date, 'probe');
      log('source_probe', { date, successful: pages.filter(page => page.sections).length, sources: pages.length });
    }
  };
}
