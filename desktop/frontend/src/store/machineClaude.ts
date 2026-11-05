import { create } from "zustand";
import { toast } from "../notifications/toast";
import { PeerInvoke } from "../../bridge/commands";
import { readHostClaude, translatePool, type MachineClaudeAccounts } from "../peer/hostClaude";
import { subscribeEveryPeer, watchConnectedPeers } from "../peer/route";
import { announceSwitch, type ClaudePool, type Switched } from "./claudePool";
import { MACHINE } from "../machineWords";

// Each connected machine's Claude accounts, read from it and kept current by the
// pool changes it forwards, so a project's menu, Settings and the sidebar's notes
// all show what that machine shows.
interface MachineClaudeStore {
  // Read from each connected machine; one too old to share them never appears.
  machines: Record<string, MachineClaudeAccounts>;
  // The connected machines' names, by slug.
  aliases: Record<string, string>;
  // Per machine, pool key -> the suggestion ("current>pick") put off here.
  dismissed: Record<string, Record<string, string>>;
  load: (slug: string) => Promise<MachineClaudeAccounts>;
  setPool: (slug: string, pool: ClaudePool | null) => void;
  accept: (slug: string, key: string) => Promise<void>;
  dismiss: (slug: string, key: string) => void;
}

// A re-read keeps each part that didn't change, so views keyed on it don't
// take it for news and read the machine again.
function unchangedParts(prev: MachineClaudeAccounts | undefined, next: MachineClaudeAccounts): MachineClaudeAccounts {
  if (!prev) return next;
  const same = <T>(a: T, b: T) => (JSON.stringify(a) === JSON.stringify(b) ? a : b);
  return {
    accounts: same(prev.accounts, next.accounts),
    statuses: same(prev.statuses, next.statuses),
    usage: same(prev.usage, next.usage),
    pool: same(prev.pool, next.pool),
  };
}

export const useMachineClaudeStore = create<MachineClaudeStore>((set, get) => ({
  machines: {},
  aliases: {},
  dismissed: {},

  load: async (slug) => {
    const found = await readHostClaude(slug);
    const kept = unchangedParts(get().machines[slug], found);
    set((s) => ({ machines: { ...s.machines, [slug]: kept } }));
    return kept;
  },

  setPool: (slug, pool) =>
    set((s) => {
      const machine = s.machines[slug];
      return machine ? { machines: { ...s.machines, [slug]: { ...machine, pool } } } : {};
    }),

  accept: async (slug, key) => {
    try {
      get().setPool(slug, translatePool(slug, await PeerInvoke(slug, "accept_claude_pool_pick", { key })));
    } catch (err) {
      toast.error(String(err));
    }
  },

  dismiss: (slug, key) => {
    const view = get().machines[slug]?.pool?.pools.find((p) => p.key === key);
    if (!view?.pick || !view.current) return;
    const dismissed = get().dismissed;
    set({
      dismissed: { ...dismissed, [slug]: { ...dismissed[slug], [key]: `${view.current}>${view.pick.id}` } },
    });
  },
}));

// A machine is read when it connects, and afresh when it comes back.
const offPeers = watchConnectedPeers((peers) => {
  const aliases = Object.fromEntries(peers.map((p) => [p.slug, p.alias]));
  const { machines, load } = useMachineClaudeStore.getState();
  const kept = Object.fromEntries(Object.entries(machines).filter(([slug]) => slug in aliases));
  useMachineClaudeStore.setState({ aliases, machines: kept });
  for (const { slug } of peers) {
    if (!(slug in kept)) load(slug).catch(() => {});
  }
});

const offPool = subscribeEveryPeer("claude-pool-changed", (slug, raw) => {
  useMachineClaudeStore.getState().setPool(slug, translatePool(slug, raw));
});

const offSwitched = subscribeEveryPeer("claude-account-switched", (slug, raw) => {
  const s = raw as Switched;
  const { machines, aliases } = useMachineClaudeStore.getState();
  const where = `${s.project ? ` in ${s.project}` : ""} on ${aliases[slug] ?? MACHINE.anotherMachine}`;
  announceSwitch(s, machines[slug]?.pool ?? null, where, machines[slug]?.accounts);
});

import.meta.hot?.dispose(() => {
  offPeers();
  offPool();
  offSwitched();
});
