import type { ProjectInfo } from "../types";
import { useRowCiPoller } from "./useRowCiPoller";
import { useRowPortsPoller } from "./useRowPortsPoller";
import { useRowStatsPoller } from "./useRowStatsPoller";
import { useRowFetchLayout } from "./useSidebarRowLayout";

// The lookups behind the details project rows show. Each runs only while the
// row layout places something that needs it, or the Row builder is open.
export function useRowDetailsPollers(projects: ProjectInfo[]): void {
  const layout = useRowFetchLayout();
  useRowStatsPoller(projects, layout);
  useRowCiPoller(projects, layout);
  useRowPortsPoller(projects, layout);
}
