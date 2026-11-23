import { SetAttentionBadge } from "../bridge/commands";
import { agentStateOf } from "./agentStatus";
import { byUrgency, foldByPane } from "./statusByPane";
import { useAppStore } from "./store/app";
import { useGlobalAgentStatus } from "./store/globalAgentStatus";
import { useSettingsStore } from "./store/settings";
import type { StatusEntry } from "./types";

const SETTLE_MS = 300;

/** The agents waiting on an answer across these status lists, counted a tab at
 *  a time as the sidebar lists them. */
export function waitingAgentCount(lists: (StatusEntry[] | undefined)[]): number {
  let count = 0;
  for (const entries of lists) {
    if (!entries?.length) continue;
    for (const { entry } of foldByPane([...entries].sort(byUrgency))) {
      if (agentStateOf(entry.value) === "needs-you") count++;
    }
  }
  return count;
}

/** Keeps the app icon's badge at the number of agents that need you, every
 *  project's and the global Terminals' alike. */
export function watchAttentionBadge(): () => void {
  let inputs: unknown[] = [];
  let sent: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const send = () => {
    timer = undefined;
    const { projects } = useAppStore.getState();
    const { entries } = useGlobalAgentStatus.getState();
    const on = useSettingsStore.getState().appIconBadge !== false;
    const count = on ? waitingAgentCount([...projects.map((p) => p.statusEntries), entries]) : 0;
    if (count === sent) return;
    sent = count;
    SetAttentionBadge(count).catch(() => {
      sent = null;
    });
  };

  const schedule = () => {
    const next = [
      useAppStore.getState().projects,
      useGlobalAgentStatus.getState().entries,
      useSettingsStore.getState().appIconBadge,
    ];
    if (next.every((value, i) => value === inputs[i])) return;
    inputs = next;
    timer ??= setTimeout(send, SETTLE_MS);
  };

  schedule();
  const unsubscribe = [
    useAppStore.subscribe(schedule),
    useGlobalAgentStatus.subscribe(schedule),
    useSettingsStore.subscribe(schedule),
  ];
  return () => {
    clearTimeout(timer);
    unsubscribe.forEach((stop) => stop());
  };
}
