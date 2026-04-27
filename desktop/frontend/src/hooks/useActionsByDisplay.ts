import { useMemo } from "react";
import {
  isFooterDisplay,
  isHeaderDisplay,
  type ActionInfo,
  type ActionsLayout,
} from "../types";

export interface UseActionsByDisplayResult {
  headerActions: ActionInfo[];
  footerActions: ActionInfo[];
  menuActions: ActionInfo[];
  headerIds: string[];
  footerIds: string[];
  layout: ActionsLayout;
}

// Single-pass split of project.actions into the three render groups
// (header / footer / menu) with the header/footer id arrays and a
// stable ActionsLayout. Bundled in one memo so the references stay
// pinned to project.actions identity — useful for downstream
// SortableContexts and the DnD layout.
export function useActionsByDisplay(actions: ActionInfo[] | undefined): UseActionsByDisplayResult {
  return useMemo(() => {
    const header: ActionInfo[] = [];
    const footer: ActionInfo[] = [];
    const menu: ActionInfo[] = [];
    const headerIds: string[] = [];
    const footerIds: string[] = [];
    for (const a of actions ?? []) {
      if (isHeaderDisplay(a.display)) { header.push(a); headerIds.push(a.name); }
      else if (isFooterDisplay(a.display)) { footer.push(a); footerIds.push(a.name); }
      else if (a.display === "menu") menu.push(a);
    }
    return {
      headerActions: header,
      footerActions: footer,
      menuActions: menu,
      headerIds,
      footerIds,
      layout: { header: headerIds, footer: footerIds },
    };
  }, [actions]);
}
