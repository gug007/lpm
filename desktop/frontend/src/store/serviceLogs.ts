import { create } from "zustand";
import type { LogSeverity } from "../components/terminal/logSeverity";

export interface ServiceLogCounts {
  errors: number;
  warnings: number;
}

// Errors and warnings each service has logged since it started, and which of
// them its pane is filtered to, keyed by the pane's session key
// (`<project>:<service>`). The pane writes both; its tab and filter bar read.
interface ServiceLogsState {
  counts: Record<string, ServiceLogCounts>;
  filter: Record<string, LogSeverity>;
  setCounts: (key: string, counts: ServiceLogCounts) => void;
  setFilter: (key: string, severity: LogSeverity | null) => void;
  forget: (key: string) => void;
}

export const useServiceLogs = create<ServiceLogsState>((set) => ({
  counts: {},
  filter: {},
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
