import { create } from "zustand";
import {
  LoadClaudeAccounts,
  RemoveClaudeAccount,
  SaveClaudeAccounts,
  ClaudeAccountsStatus,
  ClaudeAccountUsage,
} from "../../bridge/commands";
import type { ClaudeAccount } from "../types";

export interface ClaudeAccountStatus {
  signedIn: boolean;
  email: string;
}

function normalizeAccounts(raw: unknown): ClaudeAccount[] {
  const list = (raw as { accounts?: unknown })?.accounts;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is ClaudeAccount => typeof a?.id === "string" && typeof a?.label === "string")
    .map((a) => ({ id: a.id, label: a.label }));
}

function normalizeStatuses(raw: unknown): Record<string, ClaudeAccountStatus> {
  const list = (raw as { statuses?: unknown })?.statuses;
  if (!Array.isArray(list)) return {};
  const out: Record<string, ClaudeAccountStatus> = {};
  for (const s of list) {
    if (typeof s?.id !== "string") continue;
    out[s.id] = {
      signedIn: Boolean(s.signedIn),
      email: typeof s.email === "string" ? s.email : "",
    };
  }
  return out;
}

function normalizeUsage(raw: unknown): Record<string, string[]> {
  const usage = (raw as { usage?: unknown })?.usage;
  if (!usage || typeof usage !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [id, projects] of Object.entries(usage as Record<string, unknown>)) {
    if (Array.isArray(projects)) {
      out[id] = projects.filter((p): p is string => typeof p === "string");
    }
  }
  return out;
}

interface AccountsState {
  accounts: ClaudeAccount[];
  statuses: Record<string, ClaudeAccountStatus>;
  usage: Record<string, string[]>;
  hydrate: () => Promise<void>;
  refreshStatuses: () => Promise<void>;
  add: (label: string) => Promise<void>;
  rename: (id: string, label: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useAccountsStore = create<AccountsState>((set, get) => {
  const persist = async (accounts: ClaudeAccount[]) => {
    set({ accounts });
    try {
      await SaveClaudeAccounts({ accounts });
    } catch (err) {
      // The save can fail after accounts.json was written, so reconcile with
      // disk instead of rolling back to the previous list.
      await get().hydrate();
      throw err;
    }
  };

  return {
    accounts: [],
    statuses: {},
    usage: {},

    hydrate: async () => {
      try {
        set({ accounts: normalizeAccounts(await LoadClaudeAccounts()) });
      } catch {
        set({ accounts: [] });
      }
      await get().refreshStatuses();
    },

    // Sign-in status and per-account project usage both track disk state the
    // store doesn't own (a login completing, a project's pin changing), so they
    // refresh together whenever the accounts UI is shown or a login modal closes.
    refreshStatuses: async () => {
      try {
        const [statuses, usage] = await Promise.all([
          ClaudeAccountsStatus(),
          ClaudeAccountUsage(),
        ]);
        set({ statuses: normalizeStatuses(statuses), usage: normalizeUsage(usage) });
      } catch {
        // Leave the last known values in place on a transient failure.
      }
    },

    add: async (label) => persist([...get().accounts, { id: crypto.randomUUID(), label }]),

    rename: async (id, label) =>
      persist(get().accounts.map((a) => (a.id === id ? { ...a, label } : a))),

    remove: async (id) => {
      // The command deletes the account's isolated credential dir server-side,
      // so it replaces the SaveClaudeAccounts write rather than layering on it.
      set({ accounts: get().accounts.filter((a) => a.id !== id) });
      try {
        await RemoveClaudeAccount(id);
      } catch (err) {
        await get().hydrate();
        throw err;
      }
      await get().refreshStatuses();
    },
  };
});
