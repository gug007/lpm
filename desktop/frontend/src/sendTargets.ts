import { GLOBAL_TERMINALS_KEY } from "./terminals";
import { peerSlugOf } from "./peer/markers";
import type { TerminalTargetInfo } from "./store/terminalTargets";

// The tabs a composed prompt can be handed to, grouped the way the picker lists
// them: this terminal's own project first, then the other projects that are open,
// most recently used first, with the standalone Terminals last.

export interface SendTargetRow {
  projectName: string;
  projectLabel: string;
  terminalId: string;
  label: string;
  emoji: string;
  historyKey: string;
  // A prompt carrying images can only go where those files are: image paths are
  // typed into the receiving agent, and the ones this prompt holds live on the
  // machine it was composed on.
  offHost: boolean;
}

export interface SendTargetGroup {
  projectName: string;
  projectLabel: string;
  rows: SendTargetRow[];
}

export const GLOBAL_TERMINALS_LABEL = "Terminals";

interface BuildOptions {
  byProject: Record<string, TerminalTargetInfo[]>;
  // Resolves a project's folder name to what the user sees in the sidebar.
  labelOf: (projectName: string) => string;
  sourceProject: string;
  sourceTerminalId: string;
  // Most-recently-used projects, newest first; anything missing keeps the order
  // it has in `byProject`.
  mru?: string[];
  query?: string;
}

export function buildSendTargets({
  byProject,
  labelOf,
  sourceProject,
  sourceTerminalId,
  mru = [],
  query = "",
}: BuildOptions): SendTargetGroup[] {
  const sourceHost = peerSlugOf(sourceTerminalId);
  const names = Object.keys(byProject).sort(
    (a, b) => rank(a, sourceProject, mru) - rank(b, sourceProject, mru),
  );
  const needle = query.trim().toLowerCase();
  const groups: SendTargetGroup[] = [];
  for (const projectName of names) {
    const projectLabel =
      projectName === GLOBAL_TERMINALS_KEY ? GLOBAL_TERMINALS_LABEL : labelOf(projectName);
    const projectHit = needle === "" || projectLabel.toLowerCase().includes(needle);
    const rows: SendTargetRow[] = [];
    for (const target of byProject[projectName] ?? []) {
      // A prompt sent to the terminal it was written in is just a send.
      if (target.id === sourceTerminalId) continue;
      if (!projectHit && !target.label.toLowerCase().includes(needle)) continue;
      rows.push({
        projectName,
        projectLabel,
        terminalId: target.id,
        label: target.label,
        emoji: target.emoji,
        historyKey: target.historyKey,
        offHost: peerSlugOf(target.id) !== sourceHost,
      });
    }
    if (rows.length > 0) groups.push({ projectName, projectLabel, rows });
  }
  return groups;
}

// The source project leads, the standalone Terminals trail, and everything else
// sits in between by recency.
function rank(projectName: string, sourceProject: string, mru: string[]): number {
  if (projectName === sourceProject) return -1;
  if (projectName === GLOBAL_TERMINALS_KEY) return Number.MAX_SAFE_INTEGER;
  const idx = mru.indexOf(projectName);
  return idx === -1 ? mru.length : idx;
}

export function countTargets(groups: SendTargetGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
}

// Walks every row as the picker paints them, so arrow keys step across group
// boundaries instead of stopping at one.
export function flattenTargets(groups: SendTargetGroup[]): SendTargetRow[] {
  return groups.flatMap((g) => g.rows);
}
