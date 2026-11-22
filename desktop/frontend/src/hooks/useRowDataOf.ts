import { useCallback } from "react";
import type { RowData, RowStats } from "../sidebarRowDetails";
import { layoutShows, rowStatsWanted, type SidebarRowLayout } from "../sidebarRowLayout";
import { useBranchPr, type BranchPrEntry } from "../store/branchPr";
import { useOriginStatus, type OriginEntry } from "../store/originStatus";
import { useRowPorts } from "../store/rowPorts";
import { useRowStats } from "../store/rowStats";
import type { ProjectInfo } from "../types";

const NO_STATS: Record<string, RowStats> = {};
const NO_CI: Record<string, BranchPrEntry> = {};
const NO_ORIGIN: Record<string, OriginEntry> = {};
const NO_PORTS: Record<string, number[]> = {};

// Everything a project row's details read, by project. A store the layout has
// no use for isn't subscribed to, so its updates don't redraw the sidebar.
export function useRowDataOf(layout: SidebarRowLayout): (project: ProjectInfo) => RowData {
  const wantsStats = rowStatsWanted(layout);
  const wantsCi = layoutShows(layout, "pr", "checks");
  const wantsPorts = layoutShows(layout, "ports");
  const wantsOrigin = layoutShows(layout, "origin", "ahead", "branch", "pr", "checks");
  const stats = useRowStats((s) => (wantsStats ? s.entries : NO_STATS));
  const ci = useBranchPr((s) => (wantsCi ? s.entries : NO_CI));
  const ports = useRowPorts((s) => (wantsPorts ? s.byProject : NO_PORTS));
  const origin = useOriginStatus((s) => (wantsOrigin ? s.entries : NO_ORIGIN));
  return useCallback(
    (project: ProjectInfo) => ({
      stats: stats[project.root],
      ci: ci[project.root],
      origin: origin[project.root],
      ports: ports[project.name],
    }),
    [stats, ci, ports, origin],
  );
}
