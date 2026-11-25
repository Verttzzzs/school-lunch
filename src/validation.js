import { isNonLunch, stripMealLabels } from './menu-text.js';

// Only accept one nonempty plain-text translation per source meal ID.
export function validateTranslations(meals, response) {
  const entries = response?.meals;
  if (!Array.isArray(entries) || entries.length !== meals.length) throw new Error('Translation count mismatch');
  const expected = new Set(meals.map(meal => meal.id));
  const translations = new Map();
  for (const entry of entries) {
    const raw = typeof entry?.text === 'string' ? entry.text.trim() : '';
    const text = stripMealLabels(raw);
    if (!expected.delete(entry?.id) || !text || isNonLunch(text) || !/[\p{L}]/u.test(text) ||
      /[\r\n*\x60🏫❔🔴]|\b(?:closed|no menu|not available|unavailable|suljettu)\b|\((?:[A-Z]{1,3}|VEG)(?:\s*,\s*(?:[A-Z]{1,3}|VEG))*\)/iu.test(raw)) {
      throw new Error('Invalid meal translation');
    }
    translations.set(entry.id, text);
  }
  return translations;
}
