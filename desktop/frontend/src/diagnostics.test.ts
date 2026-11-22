import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiagnosticBuffer,
  formatDiagnosticsReport,
  initializeDiagnostics,
  normalizeError,
  onReportedError,
  redactDiagnosticString,
  reportError,
  sanitizeDiagnosticValue,
  type DiagnosticEntry,
} from "./diagnostics";
import redactionExamples from "./redaction.vectors.json";

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

    expect(value).toContain("~/…");
    expect(value).not.toContain("code");
    expect(value).not.toContain("alice");
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("secret-value");
  });

  it("redacts a Windows profile folder", () => {
    expect(redactDiagnosticString("open C:\\Users\\alice\\code\\a.ts")).toBe("open ~\\…");
  });

  it.each(redactionExamples)("agrees with crashreport.rs on %j", (input, expected) => {
    expect(redactDiagnosticString(input)).toBe(expected);
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

describe("reportError", () => {
  it("tells the listener, and survives one that throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const heard = vi.fn();
    onReportedError(heard);
    reportError("test.failed", "boom", { step: 1 });

    expect(heard).toHaveBeenCalledWith({
      event: "test.failed",
      error: new Error("boom"),
      details: { step: 1 },
    });

    onReportedError(() => {
      throw new Error("listener broke");
    });
    expect(reportError("test.failed", "again").message).toBe("again");
    onReportedError(null);
    vi.restoreAllMocks();
  });
});

describe("uncaught errors", () => {
  const heard = vi.fn();

  beforeAll(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", new EventTarget());
    initializeDiagnostics("main");
    onReportedError(heard);
  });

  beforeEach(() => heard.mockClear());

  afterAll(() => {
    onReportedError(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports rejections, except an editor cancelling its own work", () => {
    const reject = (reason: unknown) =>
      window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));

    const canceled = new Error("Canceled");
    canceled.name = "Canceled";
    reject(canceled);
    expect(heard).not.toHaveBeenCalled();

    reject(new Error("Canceled"));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0].event).toBe("window.unhandled_rejection");
  });

  it("reports errors, except the terminal renderer losing the GPU", () => {
    const dispatch = (error: Error) =>
      window.dispatchEvent(Object.assign(new Event("error"), { error, message: error.message }));
    const fail = (message: string, stack: string) => {
      const error = new Error(message);
      error.stack = `Error: ${message}\n${stack}`;
      dispatch(error);
    };
    const unreadable = (stack: string) => {
      const error = new DOMException("The object is in an invalid state.", "InvalidStateError");
      error.stack = stack;
      dispatch(error);
    };

    fail(
      "value must not be falsy",
      "T@tauri://localhost/assets/addon-webgl-BzUHyRKl.js:1:5998\n_initializeWebGLState@tauri://localhost/assets/addon-webgl-BzUHyRKl.js:58:16315",
    );
    unreadable(
      "getImageData@[native code]\n_drawToCache@tauri://localhost/assets/addon-webgl-BQ7i_L2W.js:1:197643\n@tauri://localhost/assets/addon-webgl-BQ7i_L2W.js:1:186436\n_process@tauri://localhost/assets/addon-webgl-BQ7i_L2W.js:1:179894",
    );
    expect(heard).not.toHaveBeenCalled();

    fail("value must not be falsy", "render@tauri://localhost/assets/index.js:1:20");
    unreadable("getImageData@[native code]\nsnapshot@tauri://localhost/assets/index.js:1:20");
    expect(heard).toHaveBeenCalledTimes(2);
    expect(heard.mock.calls.map(([report]) => report.event)).toEqual(["window.error", "window.error"]);
  });

  it("reports errors, except the editor's listener count warning", () => {
    const rethrown = (message: string) =>
      window.dispatchEvent(
        Object.assign(new Event("error"), {
          error: new Error(`${message}\n\ncreate@tauri://localhost/assets/editor.api2-BSIQRriz.js:5:34129`),
          message,
        }),
      );

    rethrown("[001] potential listener LEAK detected, having 200 listeners already. MOST frequent listener (1):");
    rethrown("[001] potential listener LEAK detected, having 300 listeners already. MOST frequent listener (51):");
    expect(heard).not.toHaveBeenCalled();

    rethrown("[001] REFUSES to accept new listeners because it exceeded its threshold by far (40001 vs 200)");
    expect(heard).toHaveBeenCalledTimes(1);
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
    expect(report).toContain("Failed in ~/…");
    expect(report).not.toContain("alice");
    expect(report).not.toContain("project");
  });

  it("normalizes non-error failures", () => {
    expect(normalizeError({ code: 500 }).message).toBe('{"code":500}');
  });
});
