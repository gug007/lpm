import { GlobeIcon } from "./icons";

// A browser tab is backed by a single native webview keyed by the tab id, which
// only one window can own. In a mirror window we render this placeholder instead
// of a second BrowserPane so we never fight the owner over the webview's bounds
// or tear it down when the mirror closes.
export function BrowserMirrorPlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-[var(--bg-primary)] text-[var(--text-muted)]">
      <GlobeIcon />
      <div className="text-xs">Browser is available in the main window</div>
    </div>
  );
}
