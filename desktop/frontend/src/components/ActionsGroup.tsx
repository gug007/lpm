import { Children, type CSSProperties, Fragment, type ReactNode, createContext, useContext } from "react";
import { SortableContext, horizontalListSortingStrategy, rectSortingStrategy } from "@dnd-kit/sortable";
import { useActionsDropZone } from "../hooks/useActionsDropZone";
import { type ActionGroup, groupAcceptsDrag, isZoneGroup } from "./actionsDndLayout";
import { useActionsActiveId, useExtractIndicator } from "./ActionsDnd";
import { EmptyDropHint } from "./EmptyDropHint";
import { ExtractPlaceholder } from "./ExtractPlaceholder";

const GroupContext = createContext<ActionGroup>("header");

export function useActionGroup(): ActionGroup {
  return useContext(GroupContext);
}

interface ActionsGroupProps {
  group: ActionGroup;
  ids: string[];
  className?: string;
  style?: CSSProperties;
  // Off for zones: their frame draws the drag state and the empty hint.
  hint?: boolean;
  emptyHint?: boolean;
  // Marks where a dragged-out menu item would land; rows default to a
  // button-sized gap.
  placeholder?: ReactNode;
  children: ReactNode;
}

export function ActionsGroup({
  group,
  ids,
  className,
  style,
  hint = true,
  emptyHint = true,
  placeholder,
  children,
}: ActionsGroupProps) {
  const activeId = useActionsActiveId();
  const { setNodeRef, hintClass } = useActionsDropZone(group, !groupAcceptsDrag(group, activeId));
  const indicator = useExtractIndicator();
  const compact = group !== "header";
  let content: ReactNode = children;
  if (indicator && indicator.group === group) {
    const arr = Children.toArray(children);
    const i = Math.max(0, Math.min(indicator.index, arr.length));
    const mark = placeholder ?? <ExtractPlaceholder compact={compact} />;
    arr.splice(i, 0, <Fragment key="extract-placeholder">{mark}</Fragment>);
    content = arr;
  }
  const strategy = isZoneGroup(group) ? rectSortingStrategy : horizontalListSortingStrategy;
  return (
    <SortableContext items={ids} strategy={strategy}>
      <GroupContext.Provider value={group}>
        <div
          ref={setNodeRef}
          data-actions-group={group}
          className={`${className ?? ""} ${hint ? hintClass : ""}`}
          style={style}
        >
          {emptyHint && ids.length === 0 && <EmptyDropHint compact={compact} />}
          {content}
        </div>
      </GroupContext.Provider>
    </SortableContext>
  );
}
