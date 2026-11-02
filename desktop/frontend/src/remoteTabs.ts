import { agentSessionOf, type AgentSessionRef } from "./agentSession";
import { isClaudeTab } from "./claudeTab";
import { canForkSession } from "./forkSession";
import { followsAgentTitle, terminalDisplayLabel, type TerminalInstance } from "./paneTree";
import { peerSlugOf } from "./peer/markers";
import type { ClaudeSwitch } from "./store/claudeSwitches";
import { detectAICLI } from "./slashCommands";

// One terminal tab as phones and paired Macs see it. `cli` is detected from the
// launch command (empty for plain shells). `agentSession` is the conversation
// whose transcript the phone's copy key reads, so only for tabs whose
// transcripts are on this Mac. The `can*` flags gate the phone's tab menu the
// way the desktop's own tab menu is gated. While the tab moves to another
// Claude account, `switchingTo` names it and `switchedFrom` is the terminal the
// tab ran before.
export interface RemoteTab {
  id: string;
  label: string;
  cli: string;
  pinned: boolean;
  emoji: string;
  historyKey: string;
  agentSession: AgentSessionRef | null;
  canFork: boolean;
  canForkCopy: boolean;
  canTitle: boolean;
  canSwitchAccount: boolean;
  switchingTo: string | null;
  switchedFrom: string | null;
}

export function remoteTabOf(
  t: TerminalInstance,
  {
    localSessions,
    sessionsReachable,
    label,
    move,
  }: { localSessions: boolean; sessionsReachable: boolean; label?: string; move?: ClaudeSwitch },
): RemoteTab {
  const canFork = canForkSession(t.resumeCmd);
  return {
    id: t.id,
    // The strip's name, which a running command can stand in for.
    label: label ?? terminalDisplayLabel(t),
    cli: detectAICLI(t.startCmd) ?? "",
    pinned: t.pinned === true,
    emoji: t.emoji ?? "",
    // Same fallback the composer uses: an older persisted tree can carry a tab
    // that predates history keys.
    historyKey: t.historyKey ?? t.id,
    agentSession: localSessions && peerSlugOf(t.id) === null ? agentSessionOf(t) : null,
    canFork,
    canForkCopy: canFork && sessionsReachable,
    canTitle: !followsAgentTitle(t) && !!agentSessionOf(t),
    canSwitchAccount: localSessions && peerSlugOf(t.id) === null && isClaudeTab(t),
    switchingTo: move?.to ?? null,
    switchedFrom: move && move.from !== t.id ? move.from : null,
  };
}

export function sameRemoteTabs(a: RemoteTab[], b: RemoteTab[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        p.id === b[i].id &&
        p.label === b[i].label &&
        p.cli === b[i].cli &&
        p.pinned === b[i].pinned &&
        p.emoji === b[i].emoji &&
        p.historyKey === b[i].historyKey &&
        p.agentSession?.provider === b[i].agentSession?.provider &&
        p.agentSession?.sessionId === b[i].agentSession?.sessionId &&
        p.canFork === b[i].canFork &&
        p.canForkCopy === b[i].canForkCopy &&
        p.canTitle === b[i].canTitle &&
        p.canSwitchAccount === b[i].canSwitchAccount &&
        p.switchingTo === b[i].switchingTo &&
        p.switchedFrom === b[i].switchedFrom,
    )
  );
}
