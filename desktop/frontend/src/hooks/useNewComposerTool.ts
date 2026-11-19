import { useCallback, useEffect } from "react";
import { ANNOUNCED_COMPOSER_TOOLS, isNewComposerTool, NEW_COMPOSER_TOOL_MS, type ComposerToolId } from "../composerTools";
import { useSettingsStore } from "../store/settings";

// Every pane's composer mounts at once: only the first one starts the week.
const starting = new Set<ComposerToolId>();

function setNewUntil(id: ComposerToolId, at: number): Promise<void> {
  // Read at call time, so retiring one tool never drops another's time.
  const { composerToolsNewUntil, update } = useSettingsStore.getState();
  return update({ composerToolsNewUntil: { ...composerToolsNewUntil, [id]: at } });
}

// Whether a composer tool on screen still wears its New dot, and the call that
// retires it. Kept in settings, so every window and every restart agrees.
export function useNewComposerTool(id: ComposerToolId) {
  const until = useSettingsStore((s) => s.composerToolsNewUntil?.[id]);
  const isNew = isNewComposerTool(id, until, Date.now());

  // The week starts the first time the tool is actually on screen, so one that
  // sits in a menu or an unused tab doesn't run out its time unseen.
  useEffect(() => {
    if (until !== undefined || !ANNOUNCED_COMPOSER_TOOLS.includes(id) || starting.has(id)) return;
    starting.add(id);
    void setNewUntil(id, Date.now() + NEW_COMPOSER_TOOL_MS).finally(() => starting.delete(id));
  }, [id, until]);

  const markSeen = useCallback(() => {
    if (isNew) void setNewUntil(id, 0);
  }, [id, isNew]);

  return { isNew, markSeen };
}
