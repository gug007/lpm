import { useCallback } from "react";
import {
  DEFAULT_COMPOSER_TOOLBAR,
  composerMenuTools,
  isDefaultComposerToolbar,
  withComposerToolbar,
  type ComposerToolId,
} from "../composerTools";
import { useSettingsStore } from "../store/settings";

// Tools that only exist for some terminals: false hides the tool from both
// places without touching where the user keeps it.
export type ComposerToolAvailability = Partial<Record<ComposerToolId, boolean>>;

// The split of the terminal input's tools between its button row and its More
// menu, and the moves between them, persisted in settings and shared by every
// composer.
export function useComposerToolbar(available: ComposerToolAvailability) {
  const inToolbar = useSettingsStore((s) => s.composerToolbar ?? DEFAULT_COMPOSER_TOOLBAR);
  const update = useSettingsStore((s) => s.update);

  // Read the layout at click time, not at render time: a write goes through the
  // settings file, so a second move made before this re-renders would otherwise
  // be computed from, and clobber back to, the pre-move list.
  const move = useCallback(
    (id: ComposerToolId, toToolbar: boolean) => {
      const current = useSettingsStore.getState().composerToolbar ?? DEFAULT_COMPOSER_TOOLBAR;
      void update({ composerToolbar: withComposerToolbar(current, id, toToolbar) });
    },
    [update],
  );
  const reset = useCallback(() => void update({ composerToolbar: undefined }), [update]);

  const shown = (id: ComposerToolId) => available[id] !== false;
  return {
    toolbar: inToolbar.filter(shown),
    menu: composerMenuTools(inToolbar).filter(shown),
    isDefault: isDefaultComposerToolbar(inToolbar),
    move,
    reset,
  };
}
