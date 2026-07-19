import { describe, expect, it } from "vitest";
import {
  DiagnosticBuffer,
  formatDiagnosticsReport,
  normalizeError,
  redactDiagnosticString,
  sanitizeDiagnosticValue,
  type DiagnosticEntry,
} from "./diagnostics";

function entry(event: string): DiagnosticEntry {
  return {
    timestamp: "2026-07-19T00:00:00.000Z",
    level: "info",
    event,
    message: event,
    surface: "main",
  };
}

describe("DiagnosticBuffer", () => {
  it("keeps only the newest entries", () => {
    const buffer = new DiagnosticBuffer(2);
    buffer.push(entry("one"));
    buffer.push(entry("two"));
    buffer.push(entry("three"));

    expect(buffer.snapshot().map((item) => item.event)).toEqual([
      "two",
      "three",
    ]);
  });

  it("returns a copy of its entries", () => {
    const buffer = new DiagnosticBuffer(1);
    buffer.push(entry("one"));
    const snapshot = buffer.snapshot();
    snapshot[0].message = "changed";

    expect(buffer.snapshot()[0].message).toBe("one");
  });
});

describe("diagnostic redaction", () => {
  it("redacts home paths and credentials", () => {
    const value = redactDiagnosticString(
      "/Users/alice/code token=abc123 Authorization: Bearer secret-value",
    );

    expect(value).toContain("~/code");
    expect(value).not.toContain("alice");
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("secret-value");
  });

  it("redacts sensitive object fields and handles cycles", () => {
    const value: Record<string, unknown> = { token: "secret", name: "safe" };
    value.self = value;

    expect(sanitizeDiagnosticValue(value)).toEqual({
      token: "[REDACTED]",
      name: "safe",
      self: "[CIRCULAR]",
    });
  });

  it("does not throw for objects that cannot be inspected", () => {
    const value = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("blocked");
        },
      },
    );

    expect(sanitizeDiagnosticValue(value)).toBe("[UNSERIALIZABLE]");
  });
});

describe("formatDiagnosticsReport", () => {
  it("includes environment, failure, and structured events", () => {
    const report = formatDiagnosticsReport({
      error: new Error("Failed in /Users/alice/project"),
      componentStack: "at App (/Users/alice/project/App.tsx)",
      environment: {
        version: "1.2.3",
        platform: "darwin/arm64",
        surface: "main",
        userAgent: "WebKit",
        viewport: "960x640@2",
        theme: "dark",
      },
      entries: [entry("app.failed")],
      generatedAt: "2026-07-19T00:00:00.000Z",
    });

    expect(report).toContain("lpm diagnostics");
    expect(report).toContain('"version": "1.2.3"');
    expect(report).toContain('"event":"app.failed"');
    expect(report).toContain("~/project");
    expect(report).not.toContain("alice");
  });

  it("normalizes non-error failures", () => {
    expect(normalizeError({ code: 500 }).message).toBe('{"code":500}');
  });
});
