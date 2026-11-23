// The numbers at the top of the Usage page, each compared only with time that
// was counted too, and only through yesterday: today is still running.
import { add, apart, dayName, monday, weekday } from "./dates.mjs";
import { compareVersions } from "./versions.mjs";

const EARLY_DAYS = 14;
const fmt = (n) => n.toLocaleString("en-US");
const count = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

function change(now, before) {
  if (!before) return null;
  const percent = Math.round(((now - before) / before) * 100);
  return { percent, title: `Through yesterday: ${fmt(now)} against ${fmt(before)}` };
}

function todayNote(today, yesterday) {
  if (!yesterday) return "the first day counted";
  const gap = today.total - yesterday.total;
  if (gap > 0) return `${fmt(gap)} more than all of yesterday`;
  if (gap === 0) return "level with all of yesterday";
  if (!today.total) return `yesterday had ${fmt(yesterday.total)}`;
  return `${Math.round((today.total / yesterday.total) * 100)}% of yesterday’s ${fmt(yesterday.total)} so far`;
}

function newestNote(newest, releases, today) {
  const release = releases.find((r) => r.version === newest);
  if (!release) return "";
  const days = apart(release.day, today);
  if (!release.tagged) return `v${newest}`;
  return `v${newest}, out ${days === 0 ? "today" : count(days, "day")}`;
}

// Right after counting began, some of a day's computers have had lpm for a
// while and are only now running a version that counts them.
function earlyNote(days, { since, today, versionsOn }) {
  if (apart(since, today) >= EARLY_DAYS || since.slice(0, 7) !== today.slice(0, 7)) return "";
  const day = days.at(-1);
  const first = day.monthly - day.installs;
  if (since === today || first <= 0) return "";
  const version = (versionsOn.get(since) ?? []).map((row) => row.version).sort(compareVersions)[0];
  return `Counting began ${dayName(since)}${version ? ` with v${version}` : ""}. ${fmt(first)} of today’s ${fmt(day.total)} already had lpm and reported for the first time, so part of this climb is people updating.`;
}

export function figures({ days, weeks, months }, context) {
  const { today, since, releases } = context;
  const [now, yesterday] = [days.at(-1), days.at(-2)];
  const sum = (from, to, field) => days.reduce((n, p) => (p.start >= from && p.start <= to ? n + p[field] : n), 0);
  const against = (field, from, to, back) => change(sum(from, to, field), sum(back, add(back, apart(from, to)), field));
  const past = add(today, -1);

  const week = monday(today);
  const lastWeek = add(week, -7);
  const weekBefore = weekday(today) > 0 && since <= lastWeek ? against("weekly", week, past, lastWeek) : null;

  const month = `${today.slice(0, 7)}-01`;
  const lastMonth = `${add(month, -1).slice(0, 7)}-01`;
  const monthBefore = past >= month && since <= lastMonth ? against("monthly", month, past, lastMonth) : null;

  const installsFrom = add(today, -6);
  const installsBefore = since <= add(today, -13) ? against("installs", installsFrom, past, add(today, -13)) : null;

  return {
    today: { n: now.total, installs: now.installs, note: todayNote(now, yesterday) },
    week: {
      n: weeks.at(-1).total, change: weekBefore,
      note: weekBefore ? "vs same days last week" : weekday(today) === 0 ? "week began today" : since > week ? `since ${dayName(since)}` : "since Monday",
    },
    month: {
      n: months.at(-1).total, change: monthBefore,
      note: monthBefore ? "vs same days last month" : month === today ? "month began today" : `since ${dayName(since > month ? since : month)}`,
    },
    installs: {
      n: sum(installsFrom, today, "installs"), change: installsBefore,
      note: installsBefore ? "vs the 7 days before" : now.installs ? `${fmt(now.installs)} of them today` : "none today",
    },
    newest: { share: now.share, note: newestNote(now.newest, releases, today) },
    early: earlyNote(days, context),
  };
}
