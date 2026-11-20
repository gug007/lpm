import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePing, utcDay } from "../src/ping.ts";

const TODAY = "2026-11-20";
// The query dailyping.rs sends (dailyping_tests.rs, the_url_carries_flags_and_no_id).
const SENT = "v=0.7.64&os=macos&arch=aarch64&kind=desktop&w=1&m=0&new=0&cohort=2026-09";

const parse = (query) => parsePing(new URLSearchParams(query), TODAY);
const swap = (key, value) => {
  const params = new URLSearchParams(SENT);
  params.set(key, value);
  return params.toString();
};

test("a ping from lpm is read field by field", () => {
  assert.deepEqual(parse(SENT), {
    version: "0.7.64",
    os: "macos",
    arch: "aarch64",
    kind: "desktop",
    cohort: "2026-09",
    weekly: 1,
    monthly: 0,
    installs: 0,
  });
  assert.equal(parse(swap("v", "0.7.65-beta.2")).version, "0.7.65-beta.2");
  assert.equal(parse(swap("kind", "host")).kind, "host");
});

test("anything lpm wouldn't send is refused", () => {
  for (const [key, value] of [
    ["v", "dev"],
    ["v", "0.7"],
    ["os", "freebsd"],
    ["arch", "x86 64"],
    ["kind", "phone"],
    ["w", "2"],
    ["m", ""],
    ["new", "yes"],
    ["cohort", "2026-13"],
    ["cohort", "26-09"],
  ]) {
    assert.equal(parse(swap(key, value)), null, `${key}=${value}`);
  }
  const missing = new URLSearchParams(SENT);
  missing.delete("new");
  assert.equal(parse(missing.toString()), null);
});

test("a day is the UTC date", () => {
  assert.equal(utcDay(new Date("2026-11-20T23:59:59-05:00")), "2026-11-21");
});

// lpm treats a refused ping as done for the day, so a refusal loses that
// computer's count for good: an odd install month is kept in range instead.
test("an install month outside lpm's lifetime is kept in range, not refused", () => {
  assert.equal(parse(swap("cohort", "2023-06"))?.cohort, "2026-03");
  assert.equal(parse(swap("cohort", "2026-12"))?.cohort, "2026-11");
  assert.equal(parse(swap("cohort", "2026-09"))?.cohort, "2026-09");
});
