// Days are UTC and written YYYY-MM-DD, months YYYY-MM, as ping/ stores them.
const DAY = 86400000;
const ms = (date) => Date.parse(date.length === 7 ? `${date}-01` : date);

export const add = (day, n) => new Date(ms(day) + n * DAY).toISOString().slice(0, 10);
export const apart = (from, to) => Math.round((ms(to) - ms(from)) / DAY);
export const weekday = (day) => (new Date(ms(day)).getUTCDay() + 6) % 7;
export const monday = (day) => add(day, -weekday(day));

export function nextMonth(month) {
  const date = new Date(ms(month));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

export const when = (date, options) => new Date(ms(date)).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
export const dayName = (day) => when(day, { month: "short", day: "numeric" });
export const monthName = (month) => when(month, { month: "long", year: "numeric" });
