// What the Usage page draws, from what queries.mjs reads: every day, week and
// month since counting began with who was counted in it, and the headlines.
import { compared } from "./compared.mjs";
import { figures } from "./figures.mjs";
import { add, dayName, monday, monthName, nextMonth, when } from "./dates.mjs";
import { compareVersions, newestOn, releaseList, versionRows } from "./versions.mjs";

const RANGES = {
  days: { keep: 91, slots: 7, key: (day) => day, next: (key) => add(key, 1) },
  weeks: { keep: 13, slots: 4, key: monday, next: (key) => add(key, 7) },
  months: { keep: 12, slots: 3, key: (day) => day.slice(0, 7), next: nextMonth },
};
const OS = { macos: "macOS", windows: "Windows", linux: "Linux" };
const ARCH = { aarch64: "ARM", x86_64: "x64" };
const MONTHS_SHOWN = 12;

function grouped(rows, field) {
  const map = new Map();
  for (const row of rows) map.set(row[field], [...(map.get(row[field]) ?? []), row]);
  return map;
}

function title(id, start, current) {
  if (id === "days") return current ? `Today, ${dayName(start)}` : when(start, { weekday: "short", month: "short", day: "numeric" });
  if (id === "weeks") return current ? `This week, from ${dayName(start)}` : `Week of ${dayName(start)}`;
  return when(start, { month: "long", year: "numeric" });
}

function tick(id, start, current) {
  if (id === "days") return current ? "Today" : when(start, { weekday: "short" }) + " " + Number(start.slice(8));
  return id === "weeks" ? dayName(start) : when(start, { month: "short" });
}

function platformName(os, arch) {
  if (os === "macos") return arch === "aarch64" ? "macOS, Apple silicon" : "macOS, Intel";
  return `${OS[os]}, ${ARCH[arch] ?? arch}`;
}

function platformRows(rows) {
  const byPlatform = new Map();
  for (const { os, arch, n } of rows) byPlatform.set(`${os} ${arch}`, (byPlatform.get(`${os} ${arch}`) ?? 0) + n);
  return [...byPlatform]
    .map(([key, n]) => {
      const [os, arch] = key.split(" ");
      const main = arch === (os === "macos" ? "aarch64" : "x86_64");
      return { name: platformName(os, arch), kind: main ? os : `${os} alt`, n };
    })
    .filter((row) => row.n)
    .sort((a, b) => b.n - a.n);
}

// Every install month up to the period's, so a month nobody is left from
// shows as a gap. Months too old for the row add up in one.
function cohortRows(rows, first, until) {
  const list = [];
  for (let month = first; month <= until; month = nextMonth(month)) list.push({ month, n: 0 });
  for (const { cohort, n } of rows) {
    const row = list.find(({ month }) => month === cohort);
    if (row) row.n += n;
  }
  const shown = list.length > MONTHS_SHOWN ? list.slice(1 - MONTHS_SHOWN) : list;
  const out = shown.map(({ month, n }) => ({ name: when(month, { month: "short" }), full: monthName(month), n, kind: month === until ? "new" : "had" }));
  if (shown.length < list.length) {
    const n = list.slice(0, 1 - MONTHS_SHOWN).reduce((sum, row) => sum + row.n, 0);
    out.unshift({ name: "Older", full: `Before ${monthName(shown[0].month)}`, n, kind: "had" });
  }
  return out;
}

function periods(id, rows, { today, since, releases, versionsOn, firstCohort }) {
  const range = RANGES[id];
  const last = range.key(today);
  const keys = [];
  for (let key = range.key(since); key <= last; key = range.next(key)) keys.push(key);
  const byKey = grouped(rows, "key");
  return keys.slice(-range.keep).map((key) => {
    const start = key.length === 7 ? `${key}-01` : key;
    const next = range.next(key);
    const end = add(next.length === 7 ? `${next}-01` : next, -1);
    const current = key === last;
    const lastDay = current ? today : end;
    const all = byKey.get(key) ?? [];
    const desktops = all.filter((row) => row.kind === "desktop");
    const total = (list, field = "n") => list.reduce((sum, row) => sum + row[field], 0);
    const versions = versionsOn.get(lastDay) ?? [];
    const newest = newestOn(releases, lastDay);
    const atNewest = versions.filter((row) => newest && compareVersions(row.version, newest) >= 0);
    return {
      key, start, current, short: start < since,
      title: title(id, start, current),
      note: start < since ? `counted from ${dayName(since)}` : current ? "so far" : "",
      tick: tick(id, start, current),
      day: dayName(start),
      total: total(desktops),
      servers: total(all) - total(desktops),
      installs: total(desktops, "installs"),
      weekly: total(desktops, "weekly"),
      monthly: total(desktops, "monthly"),
      os: Object.fromEntries(Object.keys(OS).map((os) => [os, total(desktops.filter((row) => row.os === os))])),
      platforms: platformRows(desktops),
      cohorts: cohortRows(desktops, firstCohort, lastDay.slice(0, 7)),
      versions: versionRows(versions, releases, newest),
      versionsDay: id === "days" ? "" : dayName(lastDay),
      newest: newest ?? "",
      share: total(versions) ? total(atNewest) / total(versions) : null,
      released: releases.filter((r) => r.tagged && r.day >= start && r.day <= end).map((r) => r.version),
    };
  });
}

// Of the computers installed in each month, how many were seen in each month
// since: a month can gain some when they update to a version that's counted.
function stay(months, rows) {
  const installed = [...new Set(rows.filter((row) => row.kind === "desktop").map((row) => row.cohort))].sort().slice(-MONTHS_SHOWN);
  const count = (cohort, key) =>
    rows.reduce((sum, row) => (row.kind === "desktop" && row.cohort === cohort && row.key === key ? sum + row.n : sum), 0);
  return {
    months: months.map((p) => ({ key: p.key, name: p.tick, note: p.note })),
    rows: installed.map((cohort) => ({
      name: when(cohort, { month: "short", year: "2-digit" }).replace(" ", " ’"),
      cells: months.map((p) => (cohort > p.key ? null : count(cohort, p.key))),
    })),
  };
}

function ahead(id, today) {
  const { key, next, slots } = RANGES[id];
  const out = [];
  for (let k = next(key(today)); out.length < slots; k = next(k)) out.push(tick(id, k.length === 7 ? `${k}-01` : k, false));
  return out;
}

export function build({ today, since, releases, versions, ...rows }) {
  const from = since[0]?.day;
  if (!from) return { today, since: "" };
  const context = {
    today,
    since: from,
    releases: releaseList(releases, versions),
    versionsOn: grouped(versions, "day"),
    firstCohort: rows.months.reduce((first, row) => (row.kind === "desktop" && row.cohort < first ? row.cohort : first), today.slice(0, 7)),
  };
  const out = Object.fromEntries(Object.keys(RANGES).map((id) => [id, periods(id, rows[id], context)]));
  const headlines = figures(out, context);
  return {
    today,
    since: from,
    ...out,
    slots: Object.fromEntries(Object.entries(RANGES).map(([id, range]) => [id, range.slots])),
    ahead: Object.fromEntries(Object.keys(RANGES).map((id) => [id, ahead(id, today)])),
    stay: stay(out.months, rows.months),
    figures: headlines,
    compared: compared(out, headlines, today),
  };
}
