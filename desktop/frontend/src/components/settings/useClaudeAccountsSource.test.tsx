// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useClaudeAccountsSource, type ClaudeAccountsSource } from "./useClaudeAccountsSource";
import { useMachineClaudeStore } from "../../store/machineClaude";

const h = vi.hoisted(() => ({ peerInvoke: vi.fn() }));
vi.mock("../../../bridge/commands", () =>
  new Proxy(
    { PeerInvoke: h.peerInvoke },
    {
      has: () => true,
      get: (t, prop) =>
        prop === "then" ? undefined : ((t as Record<PropertyKey, unknown>)[prop] ?? vi.fn(() => Promise.resolve(null))),
    },
  ));
vi.mock("../../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn(() => () => {})),
  }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SLUG = "abcd1234";

it("keeps a paired computer's accounts when it stops answering, without rejecting", async () => {
  h.peerInvoke.mockResolvedValue({ accounts: [{ id: "a1", label: "Work" }] });
  await useMachineClaudeStore.getState().load(SLUG);

  const seen: { source: ClaudeAccountsSource | null } = { source: null };
  function Probe() {
    seen.source = useClaudeAccountsSource(SLUG);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));

  h.peerInvoke.mockRejectedValue("peer request timed out");
  await act(async () => {
    await expect(seen.source!.refresh()).resolves.toBeUndefined();
  });
  expect(seen.source!.accounts.map((a) => a.label)).toEqual(["Work"]);
  act(() => root.unmount());
});
