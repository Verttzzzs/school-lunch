// Known Kurnii headings and their English equivalents. Anchoring the match
// keeps labels out of the message without removing words from dish names.
const categories = [
  [/^(?:erikoisannos|special(?: lunch| dish))$/iu, '⭐'],
  [/^(?:kasvislounas|vegetarisk lunch|vegetarian lunch|vegan lunch)$/iu, '🌱'],
  [/^(?:kotiruokalounas|husmanskost|home[ -](?:cooked|style) lunch)$/iu, '🍲'],
  [/^(?:salaattilounas|salladslunch|salad lunch)$/iu, '🥗'],
  [/^(?:päivän keitto|dagens soppa|soup of the day|daily soup|salad ja soup)$/iu, '🥣'],
  [/^(?:leipäateria|leipätarjonta|bread meal|bread selection|sandwich meal)$/iu, '🥪'],
  [/^(?:jälkiruoka|efterrätt|dessert)$/iu, '🍰'],
  [/^(?:lounas|dagens lunch|lunch)$/iu, '🍽️']
];

export function mealCategory(text) {
  const colon = text.indexOf(':');
  const heading = (colon === -1 ? text : text.slice(0, colon)).trim();
  const category = categories.find(([pattern]) => pattern.test(heading));
  if (!category) return null;
  return { emoji: category[1], text: colon === -1 ? '' : text.slice(colon + 1).trim() };
}

// These headings and notices describe services outside the daily lunch menu.
export function isNonLunch(text) {
  const line = text.trim().replace(/^\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\s*/, '');
  return /^(?:päivällinen|illallinen|iltaruoka|iltalounas|hävikkiruoka|hävikki(?:lounas|myynti|ruokaa)|ruokahävikin myynti|takeaway leftover(?:s| offers?)?|leftover(?:s| (?:meal|food|offers?))?|food waste(?: (?:meal|food|offers?))?|dinner|evening (?:meal|menu|special)|middag|kvällsmat|kvällsmeny|svinnmat|promotion(?:al (?:description|offer))?|tarjous|kampanja)(?=\s*[:.!]|\s+\d|$)/iu.test(line) ||
    /^(?:auta meitä vähentämään ruokahävikkiä|(?:osta|nouda) (?:hävikkiruokaa|ylijäämäruokaa)|(?:buy|take) (?:home )?(?:a )?leftovers?\b|(?:help us )?(?:reduce|fight) food waste\b|hinta sisältää\b|price includes\b)/iu.test(line);
}

// Infer an emoji for unlabelled dishes from the first dish, keeping sides intact.
export function inferMealEmoji(text) {
  const main = text.split(/\n|\s+\+\s+/, 1)[0].trim().replace(/\s*\([^()]*\)/g, '');
  if (/\b(?:keitto[\p{L}]*|soppa|soup)\b|[\p{L}]+keitto(?:a|ja)?\b/iu.test(main)) return '🥣';
  if (/(?:salaatti(?:a|ja)?|sallad|salad)\b/iu.test(main)) return '🥗';
  if (/(?:leipä(?:ä|set)?|sämpylä(?:ä|t)?|smörgås|sandwich|filled roll)\b/iu.test(main)) return '🥪';
  if (/(?:pannukakku(?:a)?|kakkua?|mousse|kiisseli(?:ä)?|jäätelö(?:ä)?|pancakes?|cake|ice cream|pudding)\b/iu.test(main)) return '🍰';
  return '🍽️';
}

// Remove a dashed alias only when it repeats words already in the same dish.
export function removeRepeatedName(text) {
  return text.split(/\s+\+\s+/).map(component => {
    const match = component.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
    if (!match) return component;
    const words = value => value.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? '';
    const alias = words(match[2]);
    return alias && ` ${words(match[1])} `.includes(` ${alias} `) ? match[1] : component;
  }).join(' + ');
}

export function stripMealLabels(text) {
  let category;
  while ((category = mealCategory(text))) text = category.text;
  return text;
}
