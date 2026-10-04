import { Children, type CSSProperties, Fragment, type ReactNode, createContext, useContext } from "react";
import {
  SortableContext,
  type SortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useActionsDropZone } from "../hooks/useActionsDropZone";
import { type ActionGroup, groupAcceptsDrag, isZoneGroup } from "./actionsDndLayout";
import { useActionsActiveId, useExtractIndicator } from "./ActionsDnd";
import { EmptyDropHint } from "./EmptyDropHint";
import { ExtractPlaceholder } from "./ExtractPlaceholder";

const GroupContext = createContext<ActionGroup>("header");

// Along one line buttons shift by the dragged one's width, which keeps
// buttons of different widths apart; a move from one line of a wrapped row to
// another moves each button into the slot it takes.
const rowSortingStrategy: SortingStrategy = (args) => {
  const { rects, activeIndex, overIndex } = args;
  const from = rects[activeIndex];
  const to = rects[overIndex];
  const acrossLines = !!from && !!to && (to.top >= from.bottom || to.bottom <= from.top);
  return acrossLines ? rectSortingStrategy(args) : horizontalListSortingStrategy(args);
};

export function useActionGroup(): ActionGroup {
  return useContext(GroupContext);
}

interface ActionsGroupProps {
  group: ActionGroup;
  ids: string[];
  className?: string;
  style?: CSSProperties;
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
  placeholder,
  children,
}: ActionsGroupProps) {
  const activeId = useActionsActiveId();
  const { setNodeRef, hintClass } = useActionsDropZone(group, !groupAcceptsDrag(group, activeId));
  const indicator = useExtractIndicator();
  const compact = group !== "header";
  // A zone's frame draws the drag state and the empty hint.
  const framed = isZoneGroup(group);
  // Always keyed the way toArray keys them, with or without the marker: a
  // switch between the two would remount every button in the row, closing an
  // open menu mid-drag.
  const content = Children.toArray(children);
  if (indicator && indicator.group === group) {
    const i = Math.max(0, Math.min(indicator.index, content.length));
    const mark = placeholder ?? <ExtractPlaceholder compact={compact} />;
    content.splice(i, 0, <Fragment key="extract-placeholder">{mark}</Fragment>);
  }
  const strategy = framed ? rectSortingStrategy : rowSortingStrategy;
  return (
    <SortableContext items={ids} strategy={strategy}>
      <GroupContext.Provider value={group}>
        <div
          ref={setNodeRef}
          data-actions-group={group}
          className={`${className ?? ""} ${framed ? "" : hintClass}`}
          style={style}
        >
          {!framed && ids.length === 0 && <EmptyDropHint compact={compact} />}
          {content}
        </div>
      </GroupContext.Provider>
    </SortableContext>
  );
}
