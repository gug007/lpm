import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { COUNT_PING, reports } from "../src/queries.ts";

const MIGRATION = readFileSync(new URL("../migrations/0001_counts.sql", import.meta.url), "utf8");

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monday = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

// Each computer flags its first ping of a week and of a month, as dailyping.rs
// does; the totals must then equal the number of distinct computers.
function simulate(db, computers) {
  const insert = db.prepare(COUNT_PING);
  for (const { days, kind, cohort, os = "macos" } of computers) {
    let last = null;
    for (const day of [...days].sort()) {
      const weekly = last === null || monday(last) !== monday(day) ? 1 : 0;
      const monthly = last === null || last.slice(0, 7) !== day.slice(0, 7) ? 1 : 0;
      const installs = last === null && cohort === day.slice(0, 7) ? 1 : 0;
      insert.run(day, "0.7.64", os, "aarch64", kind, cohort, weekly, monthly, installs);
      last = day;
    }
  }
}

const distinct = (computers, kind, inPeriod, os) =>
  computers.filter((c) => c.kind === kind && (!os || (c.os ?? "macos") === os) && c.days.some(inPeriod)).length;

// Each desktop OS column counts that OS's computers once, like the total.
function assertByOs(row, computers, inPeriod, label) {
  for (const os of ["macos", "windows", "linux"]) {
    assert.equal(row[os], distinct(computers, "desktop", inPeriod, os), `${label} ${os}`);
  }
}

test("daily, weekly and monthly totals count each computer once", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(MIGRATION);
  const today = "2026-12-02";
  const computers = [
    { kind: "desktop", cohort: "2026-03", days: ["2026-11-23", "2026-11-24", "2026-11-30", "2026-12-01", "2026-12-02"] },
    { kind: "desktop", cohort: "2026-11", os: "windows", days: ["2026-11-24", "2026-11-25", "2026-11-29"] },
    { kind: "desktop", cohort: "2026-12", os: "linux", days: ["2026-12-01", "2026-12-02"] },
    { kind: "desktop", cohort: "2026-10", days: ["2026-11-30"] },
    { kind: "host", cohort: "2026-08", days: ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"] },
  ];
  simulate(db, computers);
  const q = reports(today);

  for (const row of db.prepare(q["Daily active"]).all()) {
    assert.equal(row.desktop, distinct(computers, "desktop", (d) => d === row.day), row.day);
    assert.equal(row.hosts, distinct(computers, "host", (d) => d === row.day), row.day);
    assertByOs(row, computers, (d) => d === row.day, row.day);
  }
  const weeks = db.prepare(q["Weekly active"]).all();
  assert.deepEqual(weeks.map((w) => w.week), ["2026-11-30", "2026-11-23"]);
  for (const row of weeks) {
    assert.equal(row.desktop, distinct(computers, "desktop", (d) => monday(d) === row.week), row.week);
    assert.equal(row.hosts, 1);
    assertByOs(row, computers, (d) => monday(d) === row.week, row.week);
  }
  const months = db.prepare(q["Monthly active"]).all();
  assert.deepEqual(months.map((m) => m.month), ["2026-12", "2026-11"]);
  for (const row of months) {
    assert.equal(row.desktop, distinct(computers, "desktop", (d) => d.startsWith(row.month)), row.month);
    assert.equal(row.hosts, 1);
    assertByOs(row, computers, (d) => d.startsWith(row.month), row.month);
  }
  assert.deepEqual(
    db.prepare(q["This month's desktop users by install month"]).all().map((r) => [r.cohort, r.users]),
    [["2026-12", 1], ["2026-03", 1]],
  );
  const newInstalls = db.prepare(q["Daily active"]).all().reduce((sum, r) => sum + r.new_installs, 0);
  assert.equal(newInstalls, 2);
});

test("a ping adds to its day's row instead of keeping a row of its own", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(MIGRATION);
  const insert = db.prepare(COUNT_PING);
  for (let i = 0; i < 50; i++) insert.run("2026-11-20", "0.7.64", "macos", "aarch64", "desktop", "2026-09", i % 2, 0, 0);
  assert.deepEqual(
    { ...db.prepare("SELECT COUNT(*) AS rows, SUM(daily) AS daily, SUM(weekly) AS weekly FROM counts").get() },
    { rows: 1, daily: 50, weekly: 25 },
  );
});

test("a report refuses a day it could be tricked by", () => {
  assert.throws(() => reports("2026-11-20' OR 1=1 --"));
});
