import { inferMealEmoji, isNonLunch, mealCategory } from './menu-text.js';

// Map exact source headings to the established WhatsApp order.
const restaurants = [
  ['Mathilda', 'MATHILDA'], ['Café Oskar', 'CAFÉ OSKAR'], ['Serveri', 'SERVERI'],
  ['Alere', 'ALERE'], ['Café Alere', 'CAFÉ ALERE'], ['Ravintola Fabriikki', 'FABRIIKKI'],
  ['Restaurang W33', 'W33'], ['Cotton Club', 'COTTON CLUB']
];
const normalize = value => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const ambiguous = /^suljettu tai ei listaa saatavilla(?: klo \d{1,2}:\d{2})?[.!]?$/i;
const closed = /^(?:suljettu|stängt|closed)(?:\s+(?:tänään|today))?[.!]?$/i;
const unavailable = /^(?:ei (?:ruoka)?listaa saatavilla|ei ruokalistaa|menu not available)[.!]?$/i;
// Extract lunch from each source card before translation. Preserve multi-line
// dishes and sides while dropping notices and their continuation text.
function parseMeal(item) {
  const [heading, ...lines] = item.split(/\r?\n/);
  if (isNonLunch(heading)) return null;
  const category = mealCategory(heading);
  const content = [category ? category.text : heading, ...lines];
  const notice = content.findIndex(isNonLunch);
  const source = content.slice(0, notice < 0 ? content.length : notice).join('\n').trim();
  if (!source) return null;
  const inferred = inferMealEmoji(source);
  const emoji = category?.emoji && category.emoji !== '🍽️' ? category.emoji : inferred;
  return { source, emoji, special: emoji === '⭐' };
}

export function parseMenus(results) {
  return restaurants.map(([heading, name], index) => {
    const matches = results.flatMap(result => result.sections ?? [])
      .filter(section => normalize(section.heading) === normalize(heading));
    if (matches.length > 1) throw new Error(`Duplicate source sections for ${name}`);
    const items = (matches[0]?.items ?? []).map(item => item.trim()).filter(Boolean);
    const meals = items.filter(item => ![ambiguous, closed, unavailable].some(pattern => pattern.test(normalize(item))))
      .map(parseMeal).filter(Boolean)
      .map((meal, position) => ({ id: `${index + 1}.${position + 1}`, ...meal }));
    let status = 'unavailable';
    if (items.some(item => ambiguous.test(normalize(item)))) status = 'ambiguous';
    else if (items.some(item => closed.test(normalize(item)))) status = 'closed';
    else if (!matches.length && results.some(result => result.error)) status = 'scrape_error';
    if (meals.length) status = 'available';
    return { name, status, meals };
  });
}
