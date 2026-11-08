import { create } from "zustand";
import type { LogSeverity } from "../components/terminal/logSeverity";

export interface ServiceLogCounts {
  errors: number;
  warnings: number;
}

const FOLD_STORAGE_KEY = "lpm.serviceLogs.fold";

function loadFold(): Record<string, true> {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed = JSON.parse(localStorage.getItem(FOLD_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveFold(fold: Record<string, true>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(FOLD_STORAGE_KEY, JSON.stringify(fold));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

// Errors and warnings each service has logged since it started, and which of
// them its pane is filtered to, keyed by the pane's session key
// (`<project>:<service>`). The pane writes both; its tab and filter bar read.
// `fold` is the same key's choice to fold repeated lines, which outlives the
// session so a restart doesn't undo it.
interface ServiceLogsState {
  counts: Record<string, ServiceLogCounts>;
  filter: Record<string, LogSeverity>;
  fold: Record<string, true>;
  setCounts: (key: string, counts: ServiceLogCounts) => void;
  setFilter: (key: string, severity: LogSeverity | null) => void;
  setFold: (key: string, on: boolean) => void;
  forget: (key: string) => void;
}

export const useServiceLogs = create<ServiceLogsState>((set) => ({
  counts: {},
  filter: {},
  fold: loadFold(),
  setCounts: (key, counts) =>
    set((s) => {
      const prev = s.counts[key];
      if (prev && prev.errors === counts.errors && prev.warnings === counts.warnings) return s;
      return { counts: { ...s.counts, [key]: counts } };
    }),
  setFilter: (key, severity) =>
    set((s) => {
      if ((s.filter[key] ?? null) === severity) return s;
      const filter = { ...s.filter };
      if (severity) filter[key] = severity;
      else delete filter[key];
      return { filter };
    }),
  setFold: (key, on) =>
    set((s) => {
      if (Boolean(s.fold[key]) === on) return s;
      const fold = { ...s.fold };
      if (on) fold[key] = true;
      else delete fold[key];
      saveFold(fold);
      return { fold };
    }),
  forget: (key) =>
    set((s) => {
      if (!(key in s.counts) && !(key in s.filter)) return s;
      const counts = { ...s.counts };
      const filter = { ...s.filter };
      delete counts[key];
      delete filter[key];
      return { counts, filter };
    }),
}));
