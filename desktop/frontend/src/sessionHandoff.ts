import { agentSessionOf } from "./agentSession";
import { isClaudeTab } from "./claudeTab";
import { MACHINE } from "./machineWords";
import type { TerminalInstance } from "./paneTree";
import { parsePeerMarker, stripMarker } from "./peer/markers";
import type { PeerClient } from "./peer/usePeerState";
import type { ProjectInfo } from "./types";

// A computer a tab's session can continue on. `project` and `root` are where
// it lands there; `reason` says why it can't go right now.
export interface HandoffTarget {
  slug: string;
  label: string;
  project?: string;
  root?: string;
  reason?: string;
}

// The Claude conversation a tab would carry to another computer.
export function handoffSessionId(tab: TerminalInstance): string | null {
  return isClaudeTab(tab) && tab.resumeCmd ? (agentSessionOf(tab)?.sessionId ?? null) : null;
}

type Listed = Pick<ProjectInfo, "name" | "root" | "isRemote">;

// The same project on a paired computer goes by the same name there.
function twinOn(slug: string, name: string, projects: Listed[]): Listed | undefined {
  return projects.find((p) => {
    const marker = parsePeerMarker(p.name);
    return marker?.slug === slug && marker.raw === name && !p.isRemote;
  });
}

// Where a tab of the local project `project` can continue: every paired
// computer this one connects to, the ones that can't take it saying why.
export function handoffTargets(
  project: Listed,
  projects: Listed[],
  peers: PeerClient[],
): HandoffTarget[] {
  if (project.isRemote || parsePeerMarker(project.name)) return [];
  return peers
    .filter((peer) => peer.enabled)
    .map((peer) => {
      const row = { slug: peer.slug, label: peer.alias || peer.host };
      if (!peer.connected) return { ...row, reason: "Offline" };
      if (!peer.supportsHandoff) return { ...row, reason: "Needs a newer lpm" };
      const twin = twinOn(peer.slug, project.name, projects);
      if (!twin) return { ...row, reason: `${project.name} isn't there` };
      return { ...row, project: twin.name, root: stripMarker(twin.root) };
    });
}

// For a tab of a paired computer's project: the project here that takes its
// session back, or why it can't.
export function handoffHome(
  project: Listed,
  projects: Listed[],
  peers: PeerClient[],
): HandoffTarget | null {
  const marker = parsePeerMarker(project.name);
  if (!marker || project.isRemote) return null;
  const peer = peers.find((p) => p.slug === marker.slug);
  if (!peer) return null;
  const row = { slug: peer.slug, label: MACHINE.ThisMachine };
  if (!peer.supportsHandoff || !peer.supportsGitBring) return { ...row, reason: "Needs a newer lpm" };
  const home = projects.find((p) => p.name === marker.raw && !p.isRemote);
  if (!home) return { ...row, reason: `${marker.raw} isn't on ${MACHINE.thisMachine}` };
  return { ...row, project: home.name, root: stripMarker(project.root) };
}

export type HandoffPhase = "stopping" | "packing" | "sending" | "receiving" | "landing";

export function handoffPhaseText(phase: HandoffPhase, done: number, total: number): string {
  const percent = total > 0 ? ` ${Math.min(100, Math.round((done / total) * 100))}%` : "";
  switch (phase) {
    case "stopping":
      return "Pausing Claude";
    case "packing":
      return "Collecting the work";
    case "sending":
      return `Sending${percent}`;
    case "receiving":
      return `Receiving${percent}`;
    case "landing":
      return "Putting the work in place";
  }
}
