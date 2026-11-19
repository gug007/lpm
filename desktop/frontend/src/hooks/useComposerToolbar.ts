import { useCallback, useMemo } from "react";
import {
  COMPOSER_TOOL_IDS,
  DEFAULT_COMPOSER_TOOLBAR,
  composerMenuTools,
  isDefaultComposerToolbar,
  withComposerToolbar,
  withNewComposerTools,
  type ComposerToolId,
} from "../composerTools";
import { useSettingsStore, type Settings } from "../store/settings";

// Tools that only exist for some terminals: false hides the tool from both
// places without touching where the user keeps it.
export type ComposerToolAvailability = Partial<Record<ComposerToolId, boolean>>;

// The split of the terminal input's tools between its button row and its More
// menu, and the moves between them, persisted in settings and shared by every
// composer.
export function useComposerToolbar(available: ComposerToolAvailability) {
  const stored = useSettingsStore((s) => s.composerToolbar);
  const known = useSettingsStore((s) => s.composerToolbarKnown);
  const inToolbar = useMemo(() => savedRow(stored, known), [stored, known]);
  const update = useSettingsStore((s) => s.update);

  // Read the layout at click time, not at render time: a write goes through the
  // settings file, so a second move made before this re-renders would otherwise
  // be computed from, and clobber back to, the pre-move list. Every write
  // records the tools there are now, so the row is never offered them again.
  const move = useCallback(
    (id: ComposerToolId, toToolbar: boolean) => {
      const { composerToolbar, composerToolbarKnown } = useSettingsStore.getState();
      const current = savedRow(composerToolbar, composerToolbarKnown);
      void update({
        composerToolbar: withComposerToolbar(current, id, toToolbar),
        composerToolbarKnown: [...COMPOSER_TOOL_IDS],
      });
    },
    [update],
  );
  const reset = useCallback(
    () => void update({ composerToolbar: undefined, composerToolbarKnown: undefined }),
    [update],
  );

  const shown = (id: ComposerToolId) => available[id] !== false;
  return {
    toolbar: inToolbar.filter(shown),
    menu: composerMenuTools(inToolbar).filter(shown),
    isDefault: isDefaultComposerToolbar(inToolbar),
    move,
    reset,
  };
}

function savedRow(stored: Settings["composerToolbar"], known: Settings["composerToolbarKnown"]): ComposerToolId[] {
  return stored ? withNewComposerTools(stored, known) : [...DEFAULT_COMPOSER_TOOLBAR];
}
