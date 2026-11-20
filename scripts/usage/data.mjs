// What the Usage button shows, read from the ping Worker's database (ping/).
//   node scripts/usage/data.mjs            the page's data, as JSON
//   node scripts/usage/data.mjs --label    desktop computers seen today
// Add --local to read the database `npm run dev` in ping/ writes to.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const ping = join(root, "ping");
const wrangler = join(ping, "node_modules", "wrangler", "bin", "wrangler.js");
const where = process.argv.includes("--local") ? "--local" : "--remote";
const DAY = 86400000;
const today = new Date().toISOString().slice(0, 10);
const T = `'${today}'`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function query(sqls) {
  if (!existsSync(wrangler)) fail("wrangler isn't installed: run npm install in ping/.");
  try {
    const out = execFileSync(
      process.execPath,
      [wrangler, "d1", "execute", "lpm-ping", where, "--json", "--command", sqls.join(";\n")],
      { cwd: ping, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 14000 },
    );
    return JSON.parse(out).map((result) => result.results);
  } catch (error) {
    const said = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const line = said.split("\n").map((l) => l.replace(/^[✘▲\s]*(\[ERROR\]\s*)?/, "").trim()).find(Boolean);
    fail(/auth|login|token/i.test(said) ? "wrangler isn't signed in: run npx wrangler login in ping/." : line || String(error.message));
  }
}

if (process.argv.includes("--label")) {
  const [[row]] = query([`SELECT COALESCE(SUM(daily), 0) AS n FROM counts WHERE day = ${T} AND kind = 'desktop'`]);
  console.log(`${row.n} today`);
  process.exit(0);
}

const [daily, weekly, monthly, versions, platforms, cohorts] = query([
  `SELECT day AS date, kind, os, SUM(daily) AS n, SUM(weekly) AS w, SUM(monthly) AS m, SUM(installs) AS i
    FROM counts WHERE day > date(${T}, '-90 days') GROUP BY day, kind, os`,
  `SELECT date(day, 'weekday 0', '-6 days') AS date, kind, os, SUM(weekly) AS n
    FROM counts WHERE day >= date(${T}, 'weekday 0', '-90 days') GROUP BY 1, kind, os`,
  `SELECT substr(day, 1, 7) AS date, kind, os, SUM(monthly) AS n
    FROM counts WHERE day >= date(${T}, 'start of month', '-11 months') GROUP BY 1, kind, os`,
  `SELECT version, SUM(daily) AS n FROM counts
    WHERE kind = 'desktop' AND day > date(${T}, '-7 days') GROUP BY version ORDER BY n DESC`,
  `SELECT kind, os, arch, SUM(daily) AS n FROM counts
    WHERE day > date(${T}, '-7 days') GROUP BY kind, os, arch ORDER BY n DESC`,
  `SELECT cohort, SUM(monthly) AS n FROM counts
    WHERE kind = 'desktop' AND day >= date(${T}, 'start of month') GROUP BY cohort ORDER BY cohort DESC`,
]);

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const now = Date.parse(today);
const monday = now - ((new Date(now).getUTCDay() + 6) % 7) * DAY;
const days = Array.from({ length: 90 }, (_, i) => iso(now - (89 - i) * DAY));
const weeks = Array.from({ length: 13 }, (_, i) => iso(monday - (12 - i) * 7 * DAY));
const months = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - (11 - i));
  return d.toISOString().slice(0, 7);
});

function periods(dates, rows, extra) {
  const byDate = new Map(dates.map((date) => [date, { date, macos: 0, windows: 0, linux: 0, hosts: 0, ...extra }]));
  for (const row of rows) {
    const period = byDate.get(row.date);
    if (!period) continue;
    if (row.kind === "host") period.hosts += row.n;
    else if (row.os in period) period[row.os] += row.n;
    if (extra && row.kind === "desktop") {
      period.weekly += row.w;
      period.monthly += row.m;
      period.installs += row.i;
    }
  }
  return [...byDate.values()];
}

function latestRelease() {
  try {
    const tags = execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], { cwd: root, encoding: "utf8" });
    return (tags.split("\n").find((tag) => /^v\d+\.\d+\.\d+$/.test(tag)) ?? "").slice(1);
  } catch {
    return "";
  }
}

console.log(
  JSON.stringify({
    today,
    latest: latestRelease(),
    daily: periods(days, daily, { weekly: 0, monthly: 0, installs: 0 }),
    weekly: periods(weeks, weekly),
    monthly: periods(months, monthly),
    versions,
    platforms,
    cohorts,
  }),
);
