export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticEntry {
  timestamp: string;
  level: DiagnosticLevel;
  event: string;
  message: string;
  surface: string;
  details?: unknown;
}

export interface DiagnosticsEnvironment {
  version: string;
  platform: string;
  surface: string;
  userAgent: string;
  viewport: string;
  theme: string;
}

export interface ReportedError {
  event: string;
  error: Error;
  details?: unknown;
}

export interface DiagnosticsReportInput {
  error: unknown;
  componentStack?: string;
  environment: DiagnosticsEnvironment;
  entries?: DiagnosticEntry[];
  generatedAt?: string;
}

const SENSITIVE_KEY =
  /(?:authorization|api.?key|password|passphrase|private.?key|secret|token)/i;
const MAX_STRING_LENGTH = 6000;
const MAX_ARRAY_LENGTH = 30;
const MAX_OBJECT_KEYS = 40;

export class DiagnosticBuffer {
  private readonly entries: DiagnosticEntry[] = [];

  constructor(private readonly capacity: number) {}

  push(entry: DiagnosticEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  snapshot(): DiagnosticEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      details: sanitizeDiagnosticValue(entry.details),
    }));
  }
}

const diagnosticBuffer = new DiagnosticBuffer(100);
let currentSurface = "unknown";
let initialized = false;
let reportedErrorListener: ((reported: ReportedError) => void) | null = null;

// Who else hears of every reported error (crashReports.ts). One listener: the
// last one set replaces the one before it.
export function onReportedError(
  listener: ((reported: ReportedError) => void) | null,
): void {
  reportedErrorListener = listener;
}

export function redactDiagnosticString(value: string): string {
  return value
    .replace(/(?:\/Users\/|\/home\/|\b[a-z]:[\\/]+Users[\\/]+)[^/\\\s:]+/gi, "~")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(
      /\b((?:authorization|api[_-]?key|password|passphrase|private[_-]?key|secret|token)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:authorization|api[_-]?key|password|passphrase|private[_-]?key|secret|token)=)[^&#\s]*/gi,
      "$1[REDACTED]",
    )
    .slice(0, MAX_STRING_LENGTH);
}

function diagnosticValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactDiagnosticString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function")
    return String(value);
  if (depth >= 5) return "[MAX_DEPTH]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactDiagnosticString(value.message),
      stack: value.stack ? redactDiagnosticString(value.stack) : undefined,
      cause:
        value.cause === undefined
          ? undefined
          : diagnosticValue(value.cause, seen, depth + 1),
    };
  }

  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => diagnosticValue(item, seen, depth + 1));
  }

  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  return Object.fromEntries(
    entries.map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : diagnosticValue(item, seen, depth + 1),
    ]),
  );
}

export function sanitizeDiagnosticValue(value: unknown): unknown {
  try {
    return diagnosticValue(value, new WeakSet(), 0);
  } catch {
    return "[UNSERIALIZABLE]";
  }
}

export function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  const sanitized = sanitizeDiagnosticValue(value);
  try {
    return new Error(JSON.stringify(sanitized) ?? "Unknown error");
  } catch {
    return new Error("Unknown error");
  }
}

function writeStructuredConsole(entry: DiagnosticEntry): void {
  try {
    const output = JSON.stringify(entry);
    if (entry.level === "error") console.error(output);
    else if (entry.level === "warn") console.warn(output);
    else if (entry.level === "debug") console.debug(output);
    else console.info(output);
  } catch {
    return;
  }
}

export function logDiagnostic(
  level: DiagnosticLevel,
  event: string,
  message: string,
  details?: unknown,
): DiagnosticEntry {
  const entry: DiagnosticEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message: redactDiagnosticString(message),
    surface: currentSurface,
    details:
      details === undefined ? undefined : sanitizeDiagnosticValue(details),
  };
  diagnosticBuffer.push(entry);
  writeStructuredConsole(entry);
  return entry;
}

export function reportError(
  event: string,
  error: unknown,
  details?: unknown,
): DiagnosticEntry {
  const normalized = normalizeError(error);
  const entry = logDiagnostic("error", event, normalized.message, {
    error: normalized,
    context: details,
  });
  try {
    reportedErrorListener?.({ event, error: normalized, details });
  } catch {
    // Reporting an error must never raise another one.
  }
  return entry;
}

export function getDiagnosticEntries(): DiagnosticEntry[] {
  return diagnosticBuffer.snapshot();
}

export function getDiagnosticSurface(): string {
  return currentSurface;
}

// Monaco drops work it no longer needs by rejecting with this error, and
// ignores it wherever it catches it. On WebKit its clipboard helper leaves one
// unwatched after a refused write, which is no fault of the app's.
function isEditorCancellation(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "Canceled" && reason.message === "Canceled";
}

// xterm's WebGL renderer rebuilds itself when the webview hands back a lost GPU
// context, and throws if the GPU process goes away again halfway through. The
// terminal keeps drawing afterwards.
function isTerminalRendererRebuild(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "value must not be falsy" &&
    (error.stack ?? "").includes("_initializeWebGLState")
  );
}

export function initializeDiagnostics(surface: string): void {
  currentSurface = surface;
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (event) => {
    if (isTerminalRendererRebuild(event.error)) return;
    reportError("window.error", event.error ?? event.message, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isEditorCancellation(event.reason)) return;
    reportError("window.unhandled_rejection", event.reason);
  });

  logDiagnostic("info", "app.diagnostics_ready", "Diagnostics initialized");
}

export function formatDiagnosticsReport(input: DiagnosticsReportInput): string {
  const error = normalizeError(input.error);
  const failure = sanitizeDiagnosticValue({
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: input.componentStack,
  });
  const environment = sanitizeDiagnosticValue(input.environment);
  const entries = input.entries ?? getDiagnosticEntries();

  return [
    "lpm diagnostics",
    `Generated: ${input.generatedAt ?? new Date().toISOString()}`,
    "",
    "Environment",
    JSON.stringify(environment, null, 2),
    "",
    "Failure",
    JSON.stringify(failure, null, 2),
    "",
    `Recent events (${entries.length})`,
    ...entries.map((entry) => JSON.stringify(sanitizeDiagnosticValue(entry))),
  ].join("\n");
}
