import { projectAgentRows, tabRankIn, type SidebarAgentRow } from "./sidebarAgents";
import type { ProjectInfo, StatusEntry } from "./types";

/** Whether a row can be archived: only a turn that has ended. Work still going
 *  and a question still open stay until they settle. */
export function canArchive(row: SidebarAgentRow): boolean {
  return row.state === "done" || row.state === "error";
}

/** The rows the sidebar lists under a project: its agents as `projectAgentRows`
 *  gives them, plus the finished ones the user already opened (`seenEntries`),
 *  muted, in their tabs' places. A tab has one row, so a seen agent on a tab
 *  that has something newer to say gives way to it. Keys in `hidden` are being
 *  archived behind an Undo and are left out. */
export function sidebarAgentRows(
  project: Pick<ProjectInfo, "statusEntries" | "seenEntries">,
  now: number,
  tabTitles: Record<string, string> = {},
  hidden: ReadonlySet<string> = new Set(),
): SidebarAgentRow[] {
  const shown = (e: StatusEntry) => !hidden.has(e.key);
  const live = (project.statusEntries ?? []).filter(shown);
  const livePanes = new Set(live.map((e) => e.paneID).filter(Boolean));
  const seen = (project.seenEntries ?? []).filter(
    (e) => shown(e) && !(e.paneID && livePanes.has(e.paneID)),
  );
  const rows = projectAgentRows({ statusEntries: live }, now, tabTitles);
  if (seen.length === 0) return rows;
  const seenAt = new Map(seen.map((e) => [e.key, e.seenAt ?? 0]));
  const seenRows = projectAgentRows({ statusEntries: seen }, now, tabTitles).map((row) => ({
    ...row,
    holdsError: false,
    seenAt: Math.max(...row.keys.map((key) => seenAt.get(key) ?? 0)),
  }));
  const rank = tabRankIn(tabTitles);
  // Stable, so rows on tabs this window can't name keep the order they came in.
  return [...rows, ...seenRows].sort((a, b) => rank(a.terminalId) - rank(b.terminalId));
}

/** Which rows show while the seen ones are folded: every row that isn't seen,
 *  the `limit` most recently seen, and the one on screen. The rest fold into a
 *  "more seen" line, in the order they'd have shown. */
export function foldSeenRows(
  rows: SidebarAgentRow[],
  limit: number,
  onScreen: string | null,
): { shown: SidebarAgentRow[]; folded: SidebarAgentRow[] } {
  const seen = rows.filter((r) => r.seenAt !== undefined);
  if (seen.length <= limit) return { shown: rows, folded: [] };
  const kept = new Set(
    [...seen]
      .sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))
      .slice(0, limit)
      .map((r) => r.key),
  );
  const stays = (r: SidebarAgentRow) =>
    r.seenAt === undefined || kept.has(r.key) || (onScreen !== null && r.terminalId === onScreen);
  return { shown: rows.filter(stays), folded: rows.filter((r) => !stays(r)) };
}
