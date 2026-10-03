import { useMemo, useRef } from "react";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "../types";
import { type ActionsModel, buildActionsModel } from "../actionsLayoutModel";
import { sameLayout } from "../components/actionsDndLayout";

// `layout` is cached against its previous value so that downstream
// consumers (SortableContext items, DnD baseline ref) don't see
// identity churn when actions change but the id sequences don't.
export function useActionsByDisplay(
  actions: ActionInfo[] | undefined,
  zones: ZoneInfo[] | undefined,
): ActionsModel {
  const layoutCache = useRef<ActionsLayout | null>(null);
  return useMemo(() => {
    const model = buildActionsModel(actions ?? [], zones ?? []);
    const cached = layoutCache.current;
    const layout = cached && sameLayout(cached, model.layout) ? cached : model.layout;
    layoutCache.current = layout;
    return { ...model, layout };
  }, [actions, zones]);
}
