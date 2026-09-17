import { useCallback } from "react";
import {
  DEFAULT_PANE_TOOLBAR,
  isDefaultPaneToolbar,
  paneMenuActions,
  withPaneToolbar,
  type PaneActionId,
} from "../paneActions";
import { useSettingsStore } from "../store/settings";

// The split of pane actions between the header's toolbar and its menu, and the
// moves between them, persisted in settings and shared by every pane.
export function usePaneToolbar(hasResume: boolean) {
  const onToolbar = useSettingsStore((s) => s.paneToolbar ?? DEFAULT_PANE_TOOLBAR);
  const update = useSettingsStore((s) => s.update);

  // Read the layout at click time, not at render time: a write goes through the
  // settings file, so a second move made before this re-renders would otherwise
  // be computed from, and clobber back to, the pre-move list.
  const move = useCallback(
    (id: PaneActionId, toToolbar: boolean) => {
      const current = useSettingsStore.getState().paneToolbar ?? DEFAULT_PANE_TOOLBAR;
      void update({ paneToolbar: withPaneToolbar(current, id, toToolbar) });
    },
    [update],
  );
  const reset = useCallback(() => void update({ paneToolbar: undefined }), [update]);

  const available = (id: PaneActionId) => id !== "resume" || hasResume;
  return {
    toolbar: onToolbar.filter(available),
    menu: paneMenuActions(onToolbar).filter(available),
    isDefault: isDefaultPaneToolbar(onToolbar),
    move,
    reset,
  };
}
