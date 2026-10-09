import { create } from "zustand";
import { toast } from "sonner";
import {
  AcceptClaudePoolPick,
  ClaudePoolState,
  ResumeClaudePool,
  SetClaudePool,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { accountLabel, skipSentence } from "../claudePoolText";
import { useSettingsStore } from "./settings";

export const MAIN_POOL = "__main__";

export type PoolSkip =
  | { kind: "signedOut" }
  | { kind: "sameAccount"; as: string }
  | { kind: "notAllowed" }
  | { kind: "unconfirmed" }
  | { kind: "onHold" }
  | { kind: "hit"; window: "fiveHour" | "weekly" | null; resetsAt: number }
  | { kind: "near"; window: "fiveHour" | "weekly"; percent: number; resetsAt: number };

export interface PoolPick {
  id: string;
  kind: "first" | "mostRoom" | "soonestReset" | "fallback";
  skipped: { id: string; skip: PoolSkip }[];
}

export interface PoolView {
  key: string;
  // The project whose own list this is; null for the main accounts.
  project: string | null;
  members: string[];
  current: string | null;
  pick: PoolPick | null;
}

export interface PoolAccount {
  id: string;
  // The user confirmed it is theirs alone; only these take turns.
  confirmed: boolean;
  signedIn: boolean;
  email: string;
  plan: string;
  planLabel: string;
}

export interface ClaudePool {
  enabled: boolean;
  // Switching actually runs: on, confirmed, and possible on this machine.
  active: boolean;
  mode: "ask" | "auto";
  consented: boolean;
  unavailable: "headless" | "ambient" | "profile" | null;
  paused: "hold" | "readings" | null;
  held: string | null;
  switchAt: number;
  maxMembers: number;
  main: string[];
  allowed: string[];
  accounts: PoolAccount[];
  pools: PoolView[];
}

export interface PoolPatch {
  enabled?: boolean;
  mode?: "ask" | "auto";
  main?: string[];
  allowed?: string[];
  consent?: boolean;
  confirm?: string[];
}

// What the consent dialog is confirming: the settings change it unlocks, the
// accounts to confirm (the main list by default), and what to do after.
export interface ConsentRequest {
  patch: PoolPatch;
  members?: string[];
  onDone?: () => void | Promise<void>;
}

interface Switched {
  key: string;
  project: string | null;
  from: string;
  to: string;
  pick: PoolPick;
}

interface ClaudePoolStore {
  pool: ClaudePool | null;
  // Pool key -> the suggestion ("current>pick") the user said "Not now" to.
  dismissed: Record<string, string>;
  // Set while the consent dialog is open (from Settings or a project list).
  consentFor: ConsentRequest | null;
  // The project whose account list dialog is open.
  listDialogFor: string | null;
  hydrate: () => Promise<void>;
  update: (patch: PoolPatch) => Promise<void>;
  accept: (key: string) => Promise<void>;
  dismiss: (key: string) => void;
  resume: () => Promise<void>;
  askConsent: (request: ConsentRequest) => void;
  closeConsent: () => void;
  openListDialog: (project: string) => void;
  closeListDialog: () => void;
}

/** A pool's suggestion waiting on the user in ask mode, or null. */
export function pendingSuggestion(
  pool: ClaudePool,
  view: PoolView,
  dismissed: Record<string, string>,
): PoolPick | null {
  if (!pool.active || pool.mode !== "ask" || pool.paused) return null;
  const pick = view.pick;
  if (!pick || !view.current || pick.id === view.current) return null;
  if (dismissed[view.key] === `${view.current}>${pick.id}`) return null;
  return pick;
}

export function poolForProjectKey(pool: ClaudePool | null, key: string): PoolView | undefined {
  return pool?.pools.find((p) => p.key === key);
}

export function poolForProject(pool: ClaudePool | null, project: string): PoolView | undefined {
  return pool?.pools.find((p) => p.project === project);
}

/** Signed-in accounts among `ids` not yet confirmed as the user's own. */
export function unconfirmedAccounts(pool: ClaudePool, ids: string[]): string[] {
  return ids.filter((id) => {
    const account = pool.accounts.find((a) => a.id === id);
    return account?.signedIn && !account.confirmed;
  });
}

export const useClaudePoolStore = create<ClaudePoolStore>((set, get) => ({
  pool: null,
  dismissed: {},
  consentFor: null,
  listDialogFor: null,

  hydrate: async () => {
    try {
      set({ pool: (await ClaudePoolState()) as ClaudePool });
    } catch {
      // Keep the last known state; the next change event refreshes it.
    }
  },

  update: async (patch) => {
    try {
      set({ pool: (await SetClaudePool(patch)) as ClaudePool });
    } catch (err) {
      toast.error(String(err));
      throw err;
    }
  },

  accept: async (key) => {
    try {
      set({ pool: (await AcceptClaudePoolPick(key)) as ClaudePool });
    } catch (err) {
      toast.error(String(err));
    }
  },

  dismiss: (key) => {
    const view = poolForProjectKey(get().pool, key);
    if (!view?.pick || !view.current) return;
    set({ dismissed: { ...get().dismissed, [key]: `${view.current}>${view.pick.id}` } });
  },

  resume: async () => {
    try {
      set({ pool: (await ResumeClaudePool()) as ClaudePool });
    } catch (err) {
      toast.error(String(err));
    }
  },

  askConsent: (request) => set({ consentFor: request }),
  closeConsent: () => set({ consentFor: null }),
  openListDialog: (project) => set({ listDialogFor: project }),
  closeListDialog: () => set({ listDialogFor: null }),
}));

const offChanged = EventsOn("claude-pool-changed", (pool) => {
  useClaudePoolStore.setState({ pool: pool as ClaudePool });
});

// Readings turned on or off pause or resume switching; nothing else announces it.
const offSettings = useSettingsStore.subscribe((s, prev) => {
  if (s.claudeLimitsEnabled !== prev.claudeLimitsEnabled) void useClaudePoolStore.getState().hydrate();
});

// Automatic mode moved a pool's new sessions; say where and why. Sessions
// already running stay where they are, so the toast speaks of new ones.
const offSwitched = EventsOn("claude-account-switched", (raw) => {
  const s = raw as Switched;
  const pool = useClaudePoolStore.getState().pool;
  const to = accountLabel(s.to, pool);
  const reason = s.pick.skipped.find((k) => k.id === s.from);
  const where = s.project ? ` in ${s.project}` : "";
  toast(`New Claude sessions${where} now use ${to}`, {
    description: reason
      ? `${skipSentence(s.from, reason.skip, pool)}.`
      : `${accountLabel(s.to, pool)} is first in the list and has room.`,
  });
});

import.meta.hot?.dispose(() => {
  if (typeof offChanged === "function") offChanged();
  if (typeof offSwitched === "function") offSwitched();
  offSettings();
});
