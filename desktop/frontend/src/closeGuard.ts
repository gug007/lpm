import { create } from "zustand";
import { countBusy } from "./agentStatus";
import { isTerminalTab, terminalDisplayLabel, type TerminalInstance } from "./paneTree";
import { projectAgentRows, type SidebarAgentRow } from "./sidebarAgents";
import type { StatusEntry } from "./types";
import type { BusyAgentPlace } from "./updateBusyAgents";

/** What was asked to close while its agents were mid-task, and the ways on. */
export interface CloseQuestion {
  what: "tab" | "others" | "pane";
  /** One per tab with an agent in it. */
  agents: BusyAgentPlace[];
  closeNow: () => void;
  closeWhenDone: () => void;
  /** Set when it is already waiting for its agents: takes that back. */
  keepOpen?: () => void;
}

interface CloseGuardState {
  asking: CloseQuestion | null;
}

export const useCloseGuard = create<CloseGuardState>(() => ({ asking: null }));

export function askClose(question: CloseQuestion): void {
  useCloseGuard.setState({ asking: question });
}

export function cancelClose(): void {
  useCloseGuard.setState({ asking: null });
}

/** Run one of the question's ways on, and put the question away. */
export function answerClose(pick: (question: CloseQuestion) => (() => void) | undefined): void {
  const { asking } = useCloseGuard.getState();
  if (!asking) return;
  useCloseGuard.setState({ asking: null });
  pick(asking)?.();
}

/** A row's agents that are mid-task, those folded into it included. */
export function busyInRow(row: SidebarAgentRow): BusyAgentPlace | null {
  const busy = countBusy([row.state, ...row.shared]);
  return busy.count > 0 ? { key: row.terminalId ?? row.key, name: row.title, ...busy } : null;
}

function rowsOf(tabs: readonly TerminalInstance[], entries: StatusEntry[] | undefined, now: number) {
  const titles = Object.fromEntries(tabs.filter(isTerminalTab).map((t) => [t.id, terminalDisplayLabel(t)]));
  return projectAgentRows({ statusEntries: entries ?? [] }, now, titles).filter(
    (row) => row.terminalId !== null && row.terminalId in titles,
  );
}

/** The tabs among `tabs` that closing would end mid-task. */
export function busyTabs(
  tabs: readonly TerminalInstance[],
  entries: StatusEntry[] | undefined,
  now = Date.now(),
): BusyAgentPlace[] {
  return rowsOf(tabs, entries, now).flatMap((row) => busyInRow(row) ?? []);
}

export type TabAgentState = "pending" | "done" | "stopped";

/** What the agents of `tabs` report: at work or asking, done, or stopped by an
 *  error. A tab they report nothing for has no entry: an interrupted turn, an
 *  agent that quit and a finish already looked at all leave none. */
export function agentStates(
  tabs: readonly TerminalInstance[],
  entries: StatusEntry[] | undefined,
  now = Date.now(),
): Map<string, TabAgentState> {
  const states = new Map<string, TabAgentState>();
  for (const row of rowsOf(tabs, entries, now)) {
    const id = row.terminalId!;
    if (busyInRow(row)) states.set(id, "pending");
    else if (row.holdsError) states.set(id, "stopped");
    else if (row.state === "done") states.set(id, "done");
  }
  return states;
}
