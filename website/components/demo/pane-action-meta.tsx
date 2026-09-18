import type { ReactNode } from "react";
import { Code, Folder, Globe } from "lucide-react";
import type { PaneActionId } from "./pane-actions";

// The utility tabs a toolbar button toggles on and off. A pane action that
// opens one lights its button up while that tab is in front.
export type UtilityTabKind = "review" | "files";

export interface PaneActionMeta {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tab?: UtilityTabKind;
}

const ICON_CLASS = "h-3.5 w-3.5";

export const PANE_ACTION_META: Record<PaneActionId, PaneActionMeta> = {
  review: {
    label: "Review changes",
    icon: <Code className={ICON_CLASS} />,
    shortcut: "⌘⇧R",
    tab: "review",
  },
  files: {
    label: "Files",
    icon: <Folder className={ICON_CLASS} />,
    shortcut: "⌘⇧E",
    tab: "files",
  },
  browser: { label: "Open browser", icon: <Globe className={ICON_CLASS} /> },
};
