import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
vi.mock("../../bridge/commands", () => ({
  LoadClaudeAccounts: async () => ({
    accounts: [
      { id: "a", label: "Work", pooled: true },
      { id: "b", label: "Personal" },
      { id: 3, label: "broken" },
    ],
  }),
  SaveClaudeAccounts: (v: unknown) => save(v),
  RemoveClaudeAccount: async () => {},
  ClaudeAccountsStatus: async () => ({ statuses: [] }),
  ClaudeAccountUsage: async () => ({ usage: {} }),
}));

import { useAccountsStore } from "./accounts";

describe("accounts store", () => {
  beforeEach(async () => {
    save.mockClear();
    await useAccountsStore.getState().hydrate();
  });

  it("hydrate preserves the pooled flag and defaults it to false", () => {
    const accounts = useAccountsStore.getState().accounts;
    expect(accounts).toEqual([
      { id: "a", label: "Work", pooled: true },
      { id: "b", label: "Personal", pooled: false },
    ]);
  });

  it("setPooled persists the flag without dropping other accounts", async () => {
    await useAccountsStore.getState().setPooled("b", true);
    expect(save).toHaveBeenCalledWith({
      accounts: [
        { id: "a", label: "Work", pooled: true },
        { id: "b", label: "Personal", pooled: true },
      ],
    });
  });

  it("rename keeps the pooled flag", async () => {
    await useAccountsStore.getState().rename("a", "Client");
    const saved = save.mock.calls[0][0] as { accounts: { id: string; pooled?: boolean }[] };
    expect(saved.accounts[0]).toMatchObject({ label: "Client", pooled: true });
  });
});
