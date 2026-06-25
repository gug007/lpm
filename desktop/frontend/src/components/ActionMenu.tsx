import { useCallback, useRef } from "react";
import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";
import { DrillMenu, type DrillApi, type DrillScreen } from "./DrillMenu";
import { ActionMenuRow } from "./ActionMenuRow";
import { findActionByPath } from "../actionTree";

// Screens resolve their content from the live action tree by path on every
// render, so a structural edit in an open drilled menu (e.g. extracting an item
// out one level) is reflected immediately instead of showing a stale snapshot.
export function ActionMenu({
  action,
  onRun,
  onClose,
}: {
  action: ActionInfo;
  onRun: (child: ActionInfo) => void;
  onClose: () => void;
}) {
  const actionRef = useRef(action);
  actionRef.current = action;

  const screenFor = useCallback(
    (path: string, title: string): DrillScreen => ({
      title,
      path,
      isEmpty: () => !findActionByPath([actionRef.current], path)?.children?.length,
      render: (api: DrillApi) => {
        const node = findActionByPath([actionRef.current], path);
        const children = node?.children ?? [];
        return (
          <>
            {children.map((child) => (
              <ActionMenuRow
                key={child.name}
                child={child}
                onRun={onRun}
                onDrill={(c) => api.push(screenFor(c.name, withEmoji(c.emoji, c.label)))}
              />
            ))}
          </>
        );
      },
    }),
    [onRun],
  );

  return (
    <DrillMenu
      root={screenFor(action.name, withEmoji(action.emoji, action.label))}
      onClose={onClose}
    />
  );
}
