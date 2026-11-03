import type { ReactNode } from "react";
import type { PaneActionId } from "../../paneActions";
import { SquareSlash } from "lucide-react";
import { ClockIcon, FolderIcon, GlobeIcon, HistoryIcon, LayersIcon, SourceControlIcon } from "../icons";
import type { UtilityTabKind } from "./utilityTabToggle";
import { chordLabel } from "../../keys";

export interface PaneActionMeta {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  // The utility tab the action shows, when it is one: a toolbar button for it
  // toggles the tab and lights up while the tab is in front.
  tab?: UtilityTabKind;
}

export const PANE_ACTION_META: Record<PaneActionId, PaneActionMeta> = {
  review: { label: "Review changes", icon: <SourceControlIcon />, shortcut: chordLabel({ key: "r", meta: true, shift: true }) },
  files: { label: "Files", icon: <FolderIcon />, shortcut: chordLabel({ key: "e", meta: true, shift: true }), tab: "files" },
  toolkit: { label: "Skills & tools", icon: <LayersIcon />, shortcut: chordLabel({ key: "k", meta: true, shift: true }), tab: "toolkit" },
  commands: { label: "Commands", icon: <SquareSlash size={14} strokeWidth={1.75} />, shortcut: chordLabel({ key: "o", meta: true, shift: true }), tab: "commands" },
  automations: { label: "Automations", icon: <ClockIcon size={14} />, shortcut: chordLabel({ key: "j", meta: true, shift: true }), tab: "automations" },
  browser: { label: "Open browser", icon: <GlobeIcon /> },
  resume: { label: "Resume session", icon: <HistoryIcon /> },
};
