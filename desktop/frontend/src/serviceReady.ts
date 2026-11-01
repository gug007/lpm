import type { ServiceReady } from "./types";

// The service editor's "Ready when" fields, and the `ready:` value they write.
// The value is what someone writing the YAML by hand would put: the short form
// (`port`, a port number, a URL) unless a log line or a timeout needs the map.

export type ReadyKind = "" | "port" | "url" | "log";

export interface ReadyDraft {
  kind: ReadyKind;
  // Port: another port, or "" for the service's own. URL or log text otherwise.
  value: string;
  // Seconds; "" is the default.
  timeout: string;
}

export const DEFAULT_READY_TIMEOUT = 30;
export const MAX_READY_TIMEOUT = 3600;

export const EMPTY_READY: ReadyDraft = { kind: "", value: "", timeout: "" };

export function readyDraftFrom(ready?: ServiceReady): ReadyDraft {
  if (!ready || ready.kind === "invalid") return EMPTY_READY;
  const timeout = ready.timeout === DEFAULT_READY_TIMEOUT ? "" : String(ready.timeout);
  switch (ready.kind) {
    case "port":
      return { kind: "port", value: ready.port > 0 ? String(ready.port) : "", timeout };
    case "url":
      return { kind: "url", value: ready.url, timeout };
    case "log":
      return { kind: "log", value: ready.log, timeout };
  }
}

const isUrl = (text: string) => /^https?:\/\/.+/i.test(text);

function parseTimeout(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return DEFAULT_READY_TIMEOUT;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MAX_READY_TIMEOUT ? n : null;
}

/** Why the fields can't be saved, or null. `servicePort` is the port the
 *  form has for the service, which a bare "Port open" checks. */
export function readyDraftError(draft: ReadyDraft, servicePort: number): string | null {
  const value = draft.value.trim();
  if (draft.kind === "") return null;
  if (draft.kind === "port") {
    if (value === "" && servicePort <= 0) return "Set the service's port, or enter the port to check";
    if (value !== "" && !(/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535)) {
      return "Port must be from 1 to 65535";
    }
  }
  if (draft.kind === "url" && !isUrl(value)) return "Use a URL that starts with http:// or https://";
  if (draft.kind === "log" && value === "") return "Enter the text to wait for";
  if (parseTimeout(draft.timeout) === null) return `Timeout must be from 1 to ${MAX_READY_TIMEOUT} seconds`;
  return null;
}

/** The YAML value for `ready:`, or undefined when there is no check. Assumes
 *  `readyDraftError` passed. */
export function readyPayload(draft: ReadyDraft): unknown {
  if (draft.kind === "") return undefined;
  const value = draft.value.trim();
  const timeout = parseTimeout(draft.timeout) ?? DEFAULT_READY_TIMEOUT;
  const custom = timeout !== DEFAULT_READY_TIMEOUT;
  switch (draft.kind) {
    case "port": {
      const port = value === "" ? true : Number(value);
      if (!custom) return port === true ? "port" : port;
      return { port, timeout };
    }
    case "url":
      return custom ? { url: value, timeout } : value;
    case "log":
      return custom ? { log: value, timeout } : { log: value };
  }
}
