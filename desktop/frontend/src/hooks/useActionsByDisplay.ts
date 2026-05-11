import { useMemo, useRef } from "react";
import {
  isFooterDisplay,
  isHeaderDisplay,
  type ActionInfo,
  type ActionsLayout,
} from "../types";
import { arrayEq } from "../components/actionsDndLayout";

export interface UseActionsByDisplayResult {
  headerActions: ActionInfo[];
  footerActions: ActionInfo[];
  menuActions: ActionInfo[];
  headerIds: string[];
  footerIds: string[];
  layout: ActionsLayout;
}

// Bundled in one memo so the references stay pinned to project.actions
// identity. The `layout` object is additionally cached against its
// previous value: when actions change but the resulting header/footer
// id sequences are unchanged, we hand back the SAME `layout` reference
// so downstream consumers (SortableContext items, DnD baseline ref,
// effect deps) don't see false-positive identity churn.
export function useActionsByDisplay(actions: ActionInfo[] | undefined): UseActionsByDisplayResult {
  const layoutCache = useRef<ActionsLayout | null>(null);
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
    const cached = layoutCache.current;
    const layout: ActionsLayout =
      cached && arrayEq(cached.header, headerIds) && arrayEq(cached.footer, footerIds)
        ? cached
        : { header: headerIds, footer: footerIds };
    layoutCache.current = layout;
    return {
      headerActions: header,
      footerActions: footer,
      menuActions: menu,
      headerIds,
      footerIds,
      layout,
    };
  }, [actions]);
}
