import type { DependencyList, ReactNode, RefObject } from "react";
import { Columns2 } from "lucide-react";
import { ZapIcon } from "../icons";
import { ALL_SERVICES, filesTabLabel, terminalDisplayLabel, type TerminalInstance } from "../../paneTree";
import type { RailView } from "../../store/filesView";
import { STRIP_TAB_ATTR, useHiddenTabs } from "../../hooks/useHiddenTabs";
import type { StripEntry } from "./TabOverflowChip";

// How far the overflow chip reaches in from a strip edge; a tab inside it is
// counted as hidden.
export const STRIP_EDGE_ZONE = 32;

export const ALL_STRIP_KEY = "all";
export const serviceStripKey = (name: string) => `svc:${name}`;
export const terminalStripKey = (id: string) => `tab:${id}`;

interface PaneStripOverflowOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  edges: { left: boolean; right: boolean };
  services: { name: string; ports?: number[] }[];
  tabs: TerminalInstance[];
  filesViews: Record<string, RailView>;
  tabIcon: (tab: TerminalInstance) => ReactNode;
  // Pass ALL_SERVICES for the All tab.
  onSelectService: (name: string) => void;
  onSelectTab: (index: number) => void;
  scrollIntoView: (tab: HTMLElement | null) => void;
  deps: DependencyList;
}

// A pane's tab strip, as its overflow chips see it: the tabs past each edge,
// and how to bring one of them up.
export function usePaneStripOverflow({
  scrollRef,
  edges,
  services,
  tabs,
  filesViews,
  tabIcon,
  onSelectService,
  onSelectTab,
  scrollIntoView,
  deps,
}: PaneStripOverflowOptions) {
  const hidden = useHiddenTabs(scrollRef, edges, STRIP_EDGE_ZONE, deps);

  const entry = (key: string): StripEntry | null => {
    if (key === ALL_STRIP_KEY) return { key, label: "All", icon: <Columns2 size={14} /> };
    const svc = services.find((s) => serviceStripKey(s.name) === key);
    if (svc) {
      const ports = svc.ports ?? [];
      return {
        key,
        label: svc.name,
        icon: <ZapIcon />,
        trailing: ports.length > 0 ? ports.map((p) => `:${p}`).join(" ") : undefined,
      };
    }
    const tab = tabs.find((t) => terminalStripKey(t.id) === key);
    if (!tab) return null;
    const label = tab.kind === "files" ? filesTabLabel(tab, filesViews[tab.id] === "changes") : terminalDisplayLabel(tab);
    return { key, label, icon: tabIcon(tab) };
  };

  const select = (key: string) => {
    if (key === ALL_STRIP_KEY) onSelectService(ALL_SERVICES);
    const svc = services.find((s) => serviceStripKey(s.name) === key);
    if (svc) onSelectService(svc.name);
    const index = tabs.findIndex((t) => terminalStripKey(t.id) === key);
    if (index >= 0) onSelectTab(index);
    // The tab may already be the active one, which no effect would scroll to.
    requestAnimationFrame(() =>
      scrollIntoView(
        scrollRef.current?.querySelector<HTMLElement>(`[${STRIP_TAB_ATTR}="${CSS.escape(key)}"]`) ?? null,
      ),
    );
  };

  return {
    left: hidden.left.flatMap((key) => entry(key) ?? []),
    right: hidden.right.flatMap((key) => entry(key) ?? []),
    select,
  };
}
