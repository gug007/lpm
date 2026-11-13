// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const TARGET = {
  dsn: "https://key@o1.ingest.sentry.invalid/1",
  release: "lpm-desktop@1.2.3",
  environment: "production",
};

type Switch = { crashReports?: boolean };

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  allowed: vi.fn(),
  fetch: vi.fn(),
  settings: {} as Switch,
  listeners: [] as ((now: Switch, before: Switch) => void)[],
}));

vi.mock("../bridge/commands", () => ({
  CrashReportConfig: mocks.config,
  CrashReportsAllowed: mocks.allowed,
}));
vi.mock("./store/settings", () => ({
  getSettings: () => mocks.settings,
  useSettingsStore: {
    subscribe: (listener: (now: Switch, before: Switch) => void) => {
      mocks.listeners.push(listener);
      return () => {
        mocks.listeners.splice(mocks.listeners.indexOf(listener), 1);
      };
    },
  },
}));

async function load() {
  const crashReports = await import("./crashReports");
  const { reportError } = await import("./diagnostics");
  return { ...crashReports, reportError };
}

// The store as every window sees it once this one saved or loaded the switch.
function settingsLoaded(crashReports?: boolean) {
  const before = mocks.settings;
  mocks.settings = { crashReports };
  [...mocks.listeners].forEach((listener) => listener(mocks.settings, before));
}

function sentBodies(): string[] {
  return mocks.fetch.mock.calls.map(([, init]) => {
    const body = (init as RequestInit).body;
    return typeof body === "string" ? body : new TextDecoder().decode(body as Uint8Array);
  });
}

// Long enough for the SDK to load and an event to be built and handed over.
async function quiet() {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

beforeEach(() => {
  vi.resetModules();
  mocks.config.mockReset().mockResolvedValue(TARGET);
  mocks.allowed.mockReset().mockImplementation(async () => mocks.settings.crashReports === true);
  mocks.fetch.mockReset().mockImplementation(async () => new Response("{}", { status: 200 }));
  mocks.settings = {};
  mocks.listeners = [];
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("automatic crash reports", () => {
  it("sends nothing, and asks for no target, while the switch is off", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();
    settingsLoaded(undefined);

    reportError("test.failed", new Error("boom"));
    await quiet();

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("sends a reported error without the owner's name or their tokens", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();
    settingsLoaded(true);

    reportError("test.failed", new Error("open /Users/alice/app failed, token=abc123"), {
      componentStack: "at Sidebar (/home/alice/app/Sidebar.tsx)",
      project: "acme-secret",
      password: "hunter2",
    });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));

    const [url] = mocks.fetch.mock.calls[0];
    expect(String(url)).toContain("o1.ingest.sentry.invalid/api/1/envelope/");
    const [body] = sentBodies();
    expect(body).toContain("open ~/app failed, token=[REDACTED]");
    expect(body).not.toContain("alice");
    expect(body).not.toMatch(/\/(?:Users|home)\//);
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("acme-secret");
    expect(body).toContain("at Sidebar (~/app/Sidebar.tsx)");
    expect(body).toContain('"release":"lpm-desktop@1.2.3"');
    expect(body).toContain('"event":"test.failed"');
    expect(body).toContain('"process":"webview"');
    expect(body).not.toContain('"request"');
    expect(body).toContain('"infer_ip":"never"');
  });

  it("sends what failed before the settings loaded once they say yes", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();

    reportError("app.bootstrap_failed", new Error("early"));
    await quiet();
    expect(mocks.fetch).not.toHaveBeenCalled();

    settingsLoaded(true);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(sentBodies()[0]).toContain("early");
  });

  it("drops what failed before the settings loaded when they say no, for good", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();
    reportError("app.bootstrap_failed", new Error("early"));

    settingsLoaded(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    settingsLoaded(true);
    reportError("test.failed", new Error("later"));
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    await quiet();

    expect(sentBodies().join("")).not.toContain("early");
    expect(sentBodies()[0]).toContain("later");
  });

  it("stops as soon as the switch is turned off", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();
    settingsLoaded(true);
    reportError("test.failed", new Error("first"));
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));

    mocks.settings.crashReports = false;
    reportError("test.failed", new Error("second"));
    await quiet();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("answers to the machine's switch when this window's copy is out of date", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();
    settingsLoaded(true);
    mocks.allowed.mockResolvedValue(false);

    reportError("test.failed", new Error("switched off in another window"));
    await quiet();

    expect(mocks.allowed).toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("stops after enough reports from one window", async () => {
    const { initCrashReports, reportError } = await load();
    initCrashReports();
    settingsLoaded(true);

    for (let n = 0; n < 40; n += 1) reportError("test.failed", new Error(`failure ${n}`));
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(30));
    await quiet();

    expect(mocks.fetch).toHaveBeenCalledTimes(30);
  });
});

describe("a report sent by hand", () => {
  it("goes out with the switch off, alone, and says Sentry took it", async () => {
    const { reportError, sendCrashReport } = await load();
    reportError("test.failed", new Error("something earlier"));

    const sent = await sendCrashReport({
      event: "recovery.sent_by_hand",
      error: new Error("render failed"),
    });

    expect(sent).toBe(true);
    expect(sentBodies()[0]).toContain("render failed");
    expect(sentBodies()[0]).not.toContain('"breadcrumbs"');
  });

  it("says so when Sentry refuses it", async () => {
    mocks.fetch.mockImplementation(async () => new Response("", { status: 500 }));
    const { sendCrashReport } = await load();

    const sent = await sendCrashReport({ event: "recovery.sent_by_hand", error: new Error("x") });

    expect(sent).toBe(false);
  });

  it("is offered only while the machine isn't sending reports by itself", async () => {
    const { manualReportOffered } = await load();
    expect(await manualReportOffered()).toBe(true);

    mocks.allowed.mockResolvedValue(true);
    expect(await manualReportOffered()).toBe(false);
  });

  it("is not there in a build that reports nowhere", async () => {
    mocks.config.mockResolvedValue(null);
    const { manualReportOffered, sendCrashReport } = await load();

    expect(await manualReportOffered()).toBe(false);
    expect(await sendCrashReport({ event: "x", error: new Error("x") })).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
