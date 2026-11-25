import { inferMealEmoji, removeRepeatedName, stripMealLabels } from './menu-text.js';

// Build the WhatsApp layout from validated translations and source statuses.
const statuses = {
  closed: '🔴 CLOSED', ambiguous: '❔ CLOSED OR MENU NOT AVAILABLE',
  unavailable: '❔ MENU NOT AVAILABLE', scrape_error: '⚠️ MENU COULD NOT BE FETCHED'
};

function formatMeal({ id, emoji, special }, translations) {
  const text = removeRepeatedName(stripMealLabels(translations.get(id)));
  const icon = emoji === '🍽️' ? inferMealEmoji(text) : emoji;
  return `${icon} ${special ? 'SPECIAL LUNCH: ' : ''}${text}`;
}

export function formatMenu(date, menus, translations) {
  const blocks = menus.map(({ name, status, meals }) => {
    const lines = status === 'available'
      ? meals.map(meal => formatMeal(meal, translations))
      : [statuses[status]];
    return [`🏫 ${name}`, ...lines].join('\n');
  });
  return [`🍽️ SCHOOL LUNCH — ${date}`, ...blocks].join('\n\n');
}
