import { IS_MIRROR_WINDOW, IS_QUICK_TERMINAL_WINDOW } from "./mirror";
import { toast } from "./notifications/toast";
import { useMiniViews, type MiniView } from "./store/miniViews";

// Mini views sit in the main window, which holds every project's terminals.
export const MINI_VIEWS_HERE = !IS_MIRROR_WINDOW && !IS_QUICK_TERMINAL_WINDOW;

function said(view: MiniView, replaced: MiniView | null): void {
  toast.success(`${view.label} is kept in a mini view`, {
    id: "mini-view",
    description: replaced
      ? `Two at most, so ${replaced.label}'s view closed.`
      : "It shows in the corner while you work somewhere else.",
  });
}

/** The tab menu's Keep in a mini view, and ⌥⌘K: keeps the tab, or takes it out. */
export function toggleMiniView(view: MiniView): void {
  const { kept, replaced } = useMiniViews.getState().toggle(view);
  if (kept) said(view, replaced);
}

/** A tab dropped on the corner: kept, whether or not it already was. */
export function keepMiniView(view: MiniView): void {
  if (useMiniViews.getState().views.some((v) => v.termId === view.termId)) return;
  toggleMiniView(view);
}

export function isMiniViewKept(termId: string): boolean {
  return useMiniViews.getState().views.some((v) => v.termId === termId);
}
