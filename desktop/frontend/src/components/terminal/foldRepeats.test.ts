import { describe, expect, it } from "vitest";
import { stripAnsi } from "./filterLines";
import { foldRepeats } from "./foldRepeats";

const none = new Set<string>();
const shown = (lines: string[], expanded: ReadonlySet<string> = none) =>
  foldRepeats(lines, expanded).map((row) => stripAnsi(row.text).replace(/\s+(×\d+)\s$/, " $1"));

const session = (ms: number) => `GET /api/session 200 in ${ms}ms`;

describe("foldRepeats", () => {
  it("folds lines differing only in numbers into a count and a range", () => {
    expect(shown([session(10), session(14), session(9)])).toEqual(["GET /api/session 200 in 9–14ms ×3"]);
  });

  it("keeps a number that never changes as it is", () => {
    expect(shown(["built 3 of 7 in 1s", "built 3 of 7 in 2s", "built 3 of 7 in 5s"])).toEqual([
      "built 3 of 7 in 1–5s ×3",
    ]);
  });

  it("folds identical lines", () => {
    expect(shown(["waiting", "waiting", "waiting"])).toEqual(["waiting ×3"]);
  });

  it("leaves a pair alone", () => {
    expect(shown([session(10), session(14)])).toEqual([session(10), session(14)]);
  });

  it("splits runs around a different line", () => {
    const lines = [session(1), session(2), session(3), "⚠ Fast Refresh", session(4), session(5), session(6)];
    expect(shown(lines)).toEqual([
      "GET /api/session 200 in 1–3ms ×3",
      "⚠ Fast Refresh",
      "GET /api/session 200 in 4–6ms ×3",
    ]);
  });

  it("does not treat a digit inside a word as a number", () => {
    const lines = ["compiled file1.ts", "compiled file2.ts", "compiled file3.ts"];
    expect(shown(lines)).toEqual(lines);
  });

  it("does not fold blank lines", () => {
    expect(shown(["", "", "", ""])).toEqual(["", "", "", ""]);
  });

  it("shows the latest timestamp, even across a minute", () => {
    const lines = ["12:00:59 tick 1", "12:01:00 tick 2", "12:01:01 tick 3"];
    expect(shown(lines)).toEqual(["12:01:01 tick 1–3 ×3"]);
  });

  it("treats a full timestamp as one value", () => {
    const lines = ["2026-11-08T12:59:59.1Z up", "2026-11-08T13:00:00.2Z up", "2026-11-08T13:00:01.3Z up"];
    expect(shown(lines)).toEqual(["2026-11-08T13:00:01.3Z up ×3"]);
  });

  it("keeps colours and leaves numbers in escape codes alone", () => {
    const line = (ms: number) => `\x1b[32mGET\x1b[39m 200 in \x1b[38;5;240m${ms}ms\x1b[39m`;
    const [row] = foldRepeats([line(1), line(2), line(3)], none);
    expect(row.text).toContain("\x1b[32mGET\x1b[39m 200 in \x1b[38;5;240m1–3ms\x1b[39m");
  });

  it("marks the count as the part to click", () => {
    const [row] = foldRepeats([session(1), session(2), session(3)], none);
    expect(row.toggle?.cells).toBe(4);
  });

  it("shows every line of an expanded run under a row that folds it again", () => {
    const lines = [session(1), session(2), session(3)];
    const key = foldRepeats(lines, none)[0].toggle!.key;
    const rows = foldRepeats(lines, new Set([key]));
    expect(rows.map((row) => stripAnsi(row.text))).toEqual(["▾ 3 similar lines", ...lines]);
    expect(rows[0].toggle?.key).toBe(key);
  });

  it("keeps a run's key as the run grows and output arrives below it", () => {
    const three = [session(1), session(2), session(3)];
    const key = foldRepeats(three, none)[0].toggle!.key;
    const rows = foldRepeats([...three, session(4), "done"], new Set([key]));
    expect(rows.map((row) => stripAnsi(row.text))).toEqual(["▾ 4 similar lines", ...three, session(4), "done"]);
  });

  it("gives two runs of the same line their own keys", () => {
    const lines = [session(1), session(2), session(3), "x", session(4), session(5), session(6)];
    const rows = foldRepeats(lines, none);
    expect(rows[0].toggle!.key).not.toBe(rows[2].toggle!.key);
  });
});
