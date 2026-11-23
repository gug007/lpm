import { create } from "zustand";
import { readLocalJson, writeLocalJson } from "../localJson";

// The tabs the user has looked at, most recent first, for Ctrl+Tab. A tab is
// remembered by its persisted key, not its pty id, which changes every launch,
// so the list outlives a restart. Its name is kept too, for a project that
// isn't open yet and so can't say what its tabs are called.

const STORAGE_KEY = "lpm.tabHistory";
const CAP = 40;

export interface TabVisit {
  project: string;
  key: string;
  label: string;
}

function isVisit(v: unknown): v is TabVisit {
  const o = v as TabVisit;
  return !!o && typeof o.project === "string" && typeof o.key === "string" && typeof o.label === "string";
}

function load(): TabVisit[] {
  return readLocalJson(STORAGE_KEY, (v) => (Array.isArray(v) ? v.filter(isVisit).slice(0, CAP) : undefined), []);
}

function save(visits: TabVisit[]): void {
  writeLocalJson(STORAGE_KEY, visits);
}

interface TabHistoryState {
  visits: TabVisit[];
  visit: (visit: TabVisit) => void;
  // A mounted project's current tab names, by key.
  relabel: (project: string, labels: Record<string, string>) => void;
}

export const useTabHistory = create<TabHistoryState>((set, get) => ({
  visits: load(),

  visit: (visit) => {
    const { visits } = get();
    const first = visits[0];
    if (first && first.project === visit.project && first.key === visit.key && first.label === visit.label) return;
    const next = [visit, ...visits.filter((v) => v.project !== visit.project || v.key !== visit.key)].slice(0, CAP);
    save(next);
    set({ visits: next });
  },

  relabel: (project, labels) => {
    const { visits } = get();
    let changed = false;
    const next = visits.map((v) => {
      const label = v.project === project ? labels[v.key] : undefined;
      if (!label || label === v.label) return v;
      changed = true;
      return { ...v, label };
    });
    if (!changed) return;
    save(next);
    set({ visits: next });
  },
}));
