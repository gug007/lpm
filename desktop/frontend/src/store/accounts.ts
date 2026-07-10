import { create } from "zustand";
import { LoadClaudeAccounts, RemoveClaudeAccount, SaveClaudeAccounts } from "../../bridge/commands";
import type { ClaudeAccount } from "../types";

function normalizeAccounts(raw: unknown): ClaudeAccount[] {
  const list = (raw as { accounts?: unknown })?.accounts;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is ClaudeAccount => typeof a?.id === "string" && typeof a?.label === "string")
    .map((a) => ({ id: a.id, label: a.label }));
}

interface AccountsState {
  accounts: ClaudeAccount[];
  hydrate: () => Promise<void>;
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

    hydrate: async () => {
      try {
        set({ accounts: normalizeAccounts(await LoadClaudeAccounts()) });
      } catch {
        set({ accounts: [] });
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
    },
  };
});
