import { applyInterfaceSize } from "./interfaceSize";
import { useComposerStore } from "./store/composer";
import type { Settings } from "./store/settings";
import { applyTheme } from "./theme";

// The settings the app also holds outside the settings store: the page's theme,
// the size every window is drawn at, and whether the composer is open. Given
// only what changed, or everything once the whole file has been read again.
export function applySettingsOutsideStore(settings: Partial<Settings>): void {
  if (settings.theme) applyTheme(settings.theme);
  if ("interfaceSize" in settings) void applyInterfaceSize(settings.interfaceSize);
  if ("composerOpen" in settings) {
    useComposerStore.getState().hydrate(settings.composerOpen ?? true);
  }
}
