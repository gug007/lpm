// The line under each number on the button's hover card: how it compares with
// what was counted before it.
const fmt = (n) => n.toLocaleString("en-US");
const newInstalls = (n) => (n ? `${fmt(n)} new ${n === 1 ? "install" : "installs"}` : "no new installs yet");
const start = (text) => text[0].toUpperCase() + text.slice(1);

function installs(days, figures) {
  if (days.length === 1) return "The first day counted";
  if (days.length < 7) return `In the ${days.length} days counted, ${figures.installs.note}`;
  if (days.length < 14) return start(figures.installs.note);
  const before = days.slice(-14, -7).reduce((sum, day) => sum + day.installs, 0);
  return `${fmt(before)} in the 7 days before, ${figures.today.installs ? fmt(figures.today.installs) : "none"} today`;
}

function period(word, list, figures, today) {
  const [before, now] = [list.at(-2), list.at(-1)];
  if (!before) return { text: now.short ? start(now.note) : `The first ${word} counted` };
  const began = now.start === today ? "Began today. " : "";
  const from = before.short ? `, ${before.note}` : "";
  return { text: `${began}Last ${word} had ${fmt(before.total)}${from}`, change: figures[word].change };
}

export function compared({ days, weeks, months }, figures, today) {
  return {
    days: { text: `${start(figures.today.note)} · ${newInstalls(figures.today.installs)}` },
    weeks: period("week", weeks, figures, today),
    months: period("month", months, figures, today),
    installs: { text: installs(days, figures) },
  };
}
