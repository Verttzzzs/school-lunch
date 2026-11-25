// Convert timestamps to calendar dates and times in Finland.
export const TZ = 'Europe/Helsinki';
const format = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function helsinki(now = new Date()) {
  const parts = Object.fromEntries(format.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Kurnii exposes only the current Helsinki calendar week.
const panelNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function calendarDay(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = new Date(date + 'T00:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === date ? day : null;
}

export function panelForDate(date, today) {
  const wanted = calendarDay(date);
  const monday = calendarDay(today);
  if (!wanted || !monday) return null;
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const offset = (wanted - monday) / 86400000;
  if (offset < 0 || offset >= 7) return null;
  return { date, weekday: panelNames[wanted.getUTCDay()], monday: monday.toISOString().slice(0, 10) };
}
