import { describe, expect, it } from "vitest";
import { lineSeverity, severityLines, tallyLines } from "./logSeverity";

const ESC = String.fromCharCode(0x1b);

describe("lineSeverity", () => {
  it.each([
    "TypeError: Cannot read properties of undefined (reading 'id')",
    "Error: listen EADDRINUSE: address already in use :::3000",
    " ⨯ Error: Failed to collect page data for /api/session",
    " ⨯ TypeError: fetch failed",
    "[vite] Internal server error: Failed to resolve import \"./missing\"",
    "ActiveRecord::RecordNotFound (Couldn't find User with 'id'=42):",
    "NoMethodError (undefined method `email' for nil):",
    "Completed 500 Internal Server Error in 12ms (ActiveRecord: 0.4ms)",
    "GET /api/session 500 in 31ms",
    '[29/Oct/2026 14:02:11] "GET /api/users/ HTTP/1.1" 500 145',
    "Internal Server Error: /api/users/",
    "Traceback (most recent call last):",
    "ValueError: invalid literal for int() with base 10: 'x'",
    "ERROR:django.request:Internal Server Error: /api/x",
    "2026-10-29T14:02:11.120Z ERROR worker: job failed id=42",
    "time=2026-10-29T14:02:11Z level=error msg=\"db down\"",
    '{"level":"error","msg":"redis connection refused"}',
    "[error] connection lost",
    "error: could not compile `api` (bin \"api\") due to 2 previous errors",
    "error[E0425]: cannot find value `x` in this scope",
    "src/app.ts(3,1): error TS2304: Cannot find name 'foo'.",
    "  12:5  error  'x' is not defined  no-undef",
    "panic: runtime error: invalid memory address or nil pointer dereference",
    "thread 'main' panicked at src/main.rs:4:5:",
    "Exception in thread \"main\" java.lang.NullPointerException",
    "npm ERR! code ELIFECYCLE",
    "✘ [ERROR] Could not resolve \"react\"",
    "Unhandled Rejection at: Promise",
    "Uncaught ReferenceError: foo is not defined",
  ])("reads %j as an error", (line) => {
    expect(lineSeverity(line)).toBe("error");
  });

  it.each([
    " ⚠ Port 3000 is in use, trying 3001 instead.",
    "npm WARN deprecated inflight@1.0.6: This module is not supported",
    "warning: unused variable: `x`",
    "(node:4242) Warning: Accessing non-existent property 'x' of module exports",
    "(node:4242) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.",
    "WARNING:root:disk almost full",
    "2026-10-29 14:02:11 WARN  pool exhausted, waiting",
    "level=warn msg=\"slow query\" duration=2.3s",
    "[warn] config value missing, using default",
    "  4:10  warning  Unexpected console statement  no-console",
  ])("reads %j as a warning", (line) => {
    expect(lineSeverity(line)).toBe("warning");
  });

  it.each([
    "GET /api/session 200 in 10ms",
    "GET /items 200 in 523ms",
    'Started GET "/api/v1/users/42" for ::1 at 2026-10-29 14:02:11',
    "Completed 200 OK in 13ms (Views: 0.2ms | ActiveRecord: 0.1ms)",
    "✔ No ESLint warnings or errors",
    "Found 0 errors. Watching for file changes.",
    "webpack compiled with 0 warnings",
    "  ▲ Next.js 16.3.0",
    " ✓ Ready in 842ms",
    "    at handler (src/jobs/sync-invoices.ts:18:22)",
    "    at new ValidationError (src/errors.ts:3:9)",
    "import { ERROR_CODES } from './codes'",
    "Listening on http://0.0.0.0:3001",
    "GET /api/v1/users?page=500 200 in 9ms",
  ])("leaves %j alone", (line) => {
    expect(lineSeverity(line)).toBeNull();
  });
});

describe("tallyLines", () => {
  it("counts an error with its stack once", () => {
    const tally = tallyLines([
      "GET / 200 in 30ms",
      "TypeError: Cannot read properties of undefined (reading 'id')",
      "    at handler (src/jobs/sync-invoices.ts:18:22)",
      "    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
      "GET / 200 in 12ms",
      "Error: listen EADDRINUSE",
    ]);
    expect(tally).toMatchObject({ errors: 2, warnings: 0 });
  });

  it("counts a Python traceback and the exception closing it once", () => {
    const tally = tallyLines([
      "Traceback (most recent call last):",
      '  File "app.py", line 3, in <module>',
      "    int('x')",
      "ValueError: invalid literal for int() with base 10: 'x'",
      "ERROR:root:second failure",
    ]);
    expect(tally.errors).toBe(2);
  });

  it("counts separate error lines one by one, and warnings", () => {
    const tally = tallyLines(["ERROR one", "ERROR two", "npm WARN old", "", "ERROR three"]);
    expect(tally).toMatchObject({ errors: 3, warnings: 1 });
  });

  it("counts a warning printed right under an error's stack as a warning", () => {
    const tally = tallyLines([
      "TypeError: boom",
      "    at handler (src/a.ts:1:1)",
      " ⚠ Fast Refresh had to perform a full reload",
      "    indented after the warning",
    ]);
    expect(tally).toMatchObject({ errors: 1, warnings: 1, inError: false });
  });

  it("carries a stack across batches", () => {
    const first = tallyLines(["Traceback (most recent call last):", '  File "a.py", line 1']);
    const second = tallyLines(["    boom()", "RuntimeError: boom"], first);
    expect(second.errors).toBe(1);
  });

  it("reads through colours", () => {
    expect(tallyLines([`${ESC}[31mTypeError: boom${ESC}[39m`]).errors).toBe(1);
  });
});

describe("severityLines", () => {
  const log = [
    "GET / 200 in 30ms",
    `${ESC}[31mTypeError: boom${ESC}[39m`,
    "    at handler (src/a.ts:1:1)",
    "GET / 200 in 12ms",
    " ⚠ Port 3000 is in use",
    "",
    "    indented but unrelated",
  ].join("\n");

  it("keeps each error with its stack, colours intact", () => {
    expect(severityLines(log, "error")).toEqual([`${ESC}[31mTypeError: boom${ESC}[39m`, "    at handler (src/a.ts:1:1)"]);
  });

  it("ends an error's stack at a warning", () => {
    const text = ["TypeError: boom", "    at a (x.ts:1:1)", " ⚠ reload", "    at b (y.ts:2:2)"].join("\n");
    expect(severityLines(text, "error")).toEqual(["TypeError: boom", "    at a (x.ts:1:1)"]);
    expect(severityLines(text, "warning")).toEqual([" ⚠ reload"]);
  });

  it("keeps warnings alone", () => {
    expect(severityLines(log, "warning")).toEqual([" ⚠ Port 3000 is in use"]);
  });
});
