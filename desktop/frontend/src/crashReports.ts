// Crash reports to Sentry for errors in the interface: the webview's half of
// src-tauri/src/crashreport.rs, under the same switch (Settings › General ›
// Privacy). The SDK is loaded only once there is a report to send, and a build
// without a DSN never loads it.

import type { ErrorEvent, SeverityLevel } from "@sentry/browser";
import { CrashReportConfig, CrashReportsAllowed } from "../bridge/commands";
import {
  getDiagnosticEntries,
  getDiagnosticSurface,
  onReportedError,
  redactDiagnosticString,
  type DiagnosticLevel,
  type ReportedError,
} from "./diagnostics";
import { getSettings, useSettingsStore } from "./store/settings";

export interface CrashReportTarget {
  dsn: string;
  release: string;
  environment: string;
}

interface Reporter {
  // `eventsSince` (ms since epoch) adds the app's own events from then on.
  capture(report: ReportedError, eventsSince?: number): void;
  // Sends what was captured and shuts down: how many reports Sentry took.
  finish(timeoutMs: number): Promise<number>;
}

const MAX_HELD = 20;
// One window that keeps failing must not fill the inbox by itself.
const MAX_AUTOMATIC = 30;
const MAX_BREADCRUMBS = 30;
const SEND_TIMEOUT_MS = 8000;

const LEVELS: Record<DiagnosticLevel, SeverityLevel> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

let target: Promise<CrashReportTarget | null> | null = null;
let reporter: Promise<Reporter | null> | null = null;
// Errors from before the settings were read, when nobody could say yet whether
// reports are wanted. Null once they have been.
let held: ReportedError[] | null = [];
// When reports were last switched on in this window: what the app logged while
// they were off stays out of the reports that follow.
let allowedSince = 0;
let automaticSent = 0;

// Where this build reports to, or null when it reports nowhere.
export function crashReportTarget(): Promise<CrashReportTarget | null> {
  target ??= Promise.resolve()
    .then(() => CrashReportConfig())
    .then((found: CrashReportTarget | null) => found ?? null)
    .catch(() => null);
  return target;
}

function switchedOn(settings: { crashReports?: boolean }): boolean {
  return settings.crashReports !== false;
}

// This window's copy of the switch: enough to decide whether to load the SDK.
function switchedOnHere(): boolean {
  return switchedOn(getSettings());
}

// The switch as the machine's settings file has it now, whichever window
// changed it last. Asked before anything is sent.
function machineAllows(): Promise<boolean> {
  return Promise.resolve()
    .then(() => CrashReportsAllowed())
    .then((allowed) => allowed === true)
    .catch(() => false);
}

// Of what a caller attached to an error, only where in the interface it was
// thrown goes along. The rest can name a project or a file and stays here.
function componentStackOf(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const stack = (details as { componentStack?: unknown }).componentStack;
  return typeof stack === "string" ? stack : undefined;
}

function redactStrings(values: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(values ?? {})) {
    if (typeof value === "string") values![key] = redactDiagnosticString(value);
  }
}

// Every string a report carries passes through here on its way out.
function scrub(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.request;
  delete event.server_name;
  if (event.message) event.message = redactDiagnosticString(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactDiagnosticString(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = redactDiagnosticString(frame.filename);
      if (frame.abs_path) frame.abs_path = redactDiagnosticString(frame.abs_path);
    }
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = redactDiagnosticString(breadcrumb.message);
  }
  redactStrings(event.extra);
  redactStrings(event.tags);
  return event;
}

async function createReporter(
  { dsn, release, environment }: CrashReportTarget,
  allowed: () => Promise<boolean>,
): Promise<Reporter> {
  const {
    BrowserClient,
    Scope,
    dedupeIntegration,
    defaultStackParser,
    linkedErrorsIntegration,
    makeFetchTransport,
  } = await import("@sentry/browser");
  let taken = 0;

  const client = new BrowserClient({
    dsn,
    release,
    environment,
    stackParser: defaultStackParser,
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    // Counts of what was dropped would be sent with nothing to report.
    sendClientReports: false,
    // Unset, Sentry is told to keep the address a report came from.
    dataCollection: { userInfo: false },
    beforeSend: scrub,
    // The one way out, asked again for every envelope.
    transport: (options) => {
      const transport = makeFetchTransport(options, (input, init) => fetch(input, init));
      return {
        ...transport,
        send: async (envelope) => {
          if (!(await allowed())) return {};
          const response = await transport.send(envelope);
          if ((response.statusCode ?? 200) < 300) taken += 1;
          return response;
        },
      };
    },
  });
  const scope = new Scope();
  scope.setClient(client);
  client.init();
  scope.setTag("process", "webview");

  return {
    capture({ event, error, details }, eventsSince) {
      const local = scope.clone();
      local.setTags({ event, surface: getDiagnosticSurface() });
      const componentStack = componentStackOf(details);
      if (componentStack) local.setExtra("componentStack", componentStack);
      if (eventsSince !== undefined) {
        const recent = getDiagnosticEntries().filter(
          (entry) => Date.parse(entry.timestamp) >= eventsSince,
        );
        for (const entry of recent.slice(-MAX_BREADCRUMBS)) {
          local.addBreadcrumb({
            category: entry.event,
            message: entry.message,
            level: LEVELS[entry.level],
            timestamp: Date.parse(entry.timestamp) / 1000,
          });
        }
      }
      local.captureException(error);
    },
    finish: async (timeoutMs) => {
      await client.close(timeoutMs);
      return taken;
    },
  };
}

function automaticReporter(): Promise<Reporter | null> {
  reporter ??= crashReportTarget()
    .then((found) => (found ? createReporter(found, machineAllows) : null))
    .catch(() => null);
  return reporter;
}

function deliver(report: ReportedError): void {
  if (automaticSent >= MAX_AUTOMATIC) return;
  automaticSent += 1;
  void automaticReporter().then((ready) => ready?.capture(report, allowedSince));
}

// Report every error the app reports (diagnostics.ts) for as long as the
// switch is on. Call once, before the settings load.
export function initCrashReports(): void {
  onReportedError((report) => {
    if (held) {
      if (held.length < MAX_HELD) held.push(report);
    } else if (switchedOnHere()) {
      deliver(report);
    }
  });
  useSettingsStore.subscribe((now, before) => {
    if (held) {
      const early = held;
      held = null;
      if (switchedOn(now)) early.forEach(deliver);
    } else if (switchedOn(now) && !switchedOn(before)) {
      allowedSince = Date.now();
    }
  });
}

// Whether the crash screen has a report to offer: only in a build that reports
// somewhere, on a machine that isn't sending its reports by itself.
export async function manualReportOffered(): Promise<boolean> {
  return (await crashReportTarget()) !== null && !(await machineAllows());
}

// Send this one error, and nothing of what led to it, because the person asked
// to, whatever the switch says. Resolves to whether Sentry took it.
export async function sendCrashReport(report: ReportedError): Promise<boolean> {
  try {
    const found = await crashReportTarget();
    if (!found) return false;
    const manual = await createReporter(found, async () => true);
    manual.capture(report);
    return (await manual.finish(SEND_TIMEOUT_MS)) > 0;
  } catch {
    return false;
  }
}
