import {
  clampIdx,
  collectPanes,
  firstPaneId,
  isTerminalTab,
  mapPane,
  type PaneNode,
  type SplitDirection,
  type TerminalInstance,
} from "./paneTree";
import { detectAICLI } from "./slashCommands";
import { disambiguateLabelAgainst, nextTerminalLabel } from "./terminalLabels";
import type { AICLI } from "./types";

// What a tab is, not which session it ran: an action is relaunched by name and
// an agent starts a new conversation, so a layout never resumes or replays one.
export interface SavedLayoutTab {
  label: string;
  actionName?: string;
  agent?: AICLI;
  emoji?: string;
  color?: string;
}

export type SavedLayoutNode =
  | { kind: "leaf"; tabs: SavedLayoutTab[]; activeTabIdx: number }
  | { kind: "split"; direction: SplitDirection; ratio: number; a: SavedLayoutNode; b: SavedLayoutNode };

export interface SavedLayout {
  id: string;
  name: string;
  root: SavedLayoutNode;
}

export interface ProjectLayouts {
  layouts: SavedLayout[];
  // Opened by itself when the project has no terminals open.
  defaultId?: string;
}

export type SavedLayoutsConfig = Record<string, ProjectLayouts>;

const SHELL_LABEL = /^Terminal(?: \d+)?$/;

/** Whose layouts a project uses: a copy or worktree shares its original's, as
 *  it shares its actions. */
export function layoutOwner(project: { name: string; parentName?: string }): string {
  return project.parentName || project.name;
}

function savedTab(t: TerminalInstance): SavedLayoutTab | null {
  if (!isTerminalTab(t)) return null;
  const agent = t.agentEnded
    ? null
    : (detectAICLI(t.startCmd ?? t.resumeCmd) ?? t.agentSession?.provider ?? null);
  const tab: SavedLayoutTab = {
    label: !t.actionName && !agent && SHELL_LABEL.test(t.label) ? "Terminal" : t.label,
  };
  if (t.actionName) tab.actionName = t.actionName;
  else if (agent) tab.agent = agent;
  if (t.emoji) tab.emoji = t.emoji;
  if (t.color) tab.color = t.color;
  return tab;
}

/** The shape of the panes on screen and what runs in each, for saving. Tabs
 *  that aren't terminals (files, browser, memory…) aren't kept, but their pane
 *  is, so the arrangement survives. */
export function captureLayout(node: PaneNode): SavedLayoutNode {
  if (node.kind === "leaf") {
    const kept: SavedLayoutTab[] = [];
    let active = 0;
    node.tabs.forEach((t, i) => {
      const tab = savedTab(t);
      if (!tab) return;
      if (i <= node.activeTabIdx) active = kept.length;
      kept.push(tab);
    });
    return { kind: "leaf", tabs: kept, activeTabIdx: active };
  }
  return {
    kind: "split",
    direction: node.direction,
    ratio: node.ratio,
    a: captureLayout(node.a),
    b: captureLayout(node.b),
  };
}

export function countLayoutTabs(node: SavedLayoutNode): number {
  return node.kind === "leaf" ? node.tabs.length : countLayoutTabs(node.a) + countLayoutTabs(node.b);
}

export function countLayoutPanes(node: SavedLayoutNode): number {
  return node.kind === "leaf" ? 1 : countLayoutPanes(node.a) + countLayoutPanes(node.b);
}

const isShell = (tab: SavedLayoutTab) => !tab.actionName && !tab.agent && tab.label === "Terminal";

/** The layout with every tab's label made unique against `used` and each
 *  other, in reading order, and an empty pane given a shell — except the first
 *  when `firstMayBeEmpty`, since what is already open moves into it. */
export function prepareLayout(
  root: SavedLayoutNode,
  usedLabels: Iterable<string>,
  firstMayBeEmpty: boolean,
): SavedLayoutNode {
  const used = new Set(usedLabels);
  let first = true;
  const visit = (node: SavedLayoutNode): SavedLayoutNode => {
    if (node.kind === "split") return { ...node, a: visit(node.a), b: visit(node.b) };
    const isFirst = first;
    first = false;
    const tabs =
      node.tabs.length === 0 && !(isFirst && firstMayBeEmpty) ? [{ label: "Terminal" }] : node.tabs;
    return {
      ...node,
      tabs: tabs.map((tab) => {
        const label = isShell(tab) ? nextTerminalLabel(used) : disambiguateLabelAgainst(tab.label, used);
        used.add(label);
        return { ...tab, label };
      }),
    };
  };
  return visit(root);
}

/** `built` with every tab already open moved into its first pane, ahead of the
 *  layout's own, so opening a layout never closes anything. That pane keeps
 *  the service log it was showing unless the layout puts a tab there. */
export function mergeOpenTabs(current: PaneNode | null, built: PaneNode): PaneNode {
  if (!current) return built;
  const panes = collectPanes(current);
  const open = panes.flatMap((p) => p.tabs);
  const service = panes[0]?.activeServiceName;
  return mapPane(built, firstPaneId(built), (p) => ({
    ...p,
    tabs: [...open, ...p.tabs],
    activeTabIdx: p.tabs.length > 0 ? open.length + clampIdx(p.activeTabIdx, p.tabs.length) : 0,
    activeServiceName: p.tabs.length > 0 ? undefined : service,
  }));
}

function updateProject(
  config: SavedLayoutsConfig | undefined,
  owner: string,
  fn: (current: ProjectLayouts) => ProjectLayouts,
): SavedLayoutsConfig | undefined {
  const next = { ...config };
  const updated = fn(next[owner] ?? { layouts: [] });
  if (updated.layouts.length === 0) delete next[owner];
  else next[owner] = updated;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function withSavedLayout(
  config: SavedLayoutsConfig | undefined,
  owner: string,
  layout: SavedLayout,
): SavedLayoutsConfig | undefined {
  return updateProject(config, owner, (p) => ({
    ...p,
    layouts: p.layouts.some((l) => l.id === layout.id)
      ? p.layouts.map((l) => (l.id === layout.id ? layout : l))
      : [...p.layouts, layout],
  }));
}

export function withoutSavedLayout(
  config: SavedLayoutsConfig | undefined,
  owner: string,
  id: string,
): SavedLayoutsConfig | undefined {
  return updateProject(config, owner, (p) => ({
    layouts: p.layouts.filter((l) => l.id !== id),
    defaultId: p.defaultId === id ? undefined : p.defaultId,
  }));
}

export function withDefaultLayout(
  config: SavedLayoutsConfig | undefined,
  owner: string,
  id: string | undefined,
): SavedLayoutsConfig | undefined {
  return updateProject(config, owner, (p) => ({ ...p, defaultId: id }));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const optString = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function normalizeTab(raw: unknown): SavedLayoutTab | null {
  if (!isRecord(raw) || typeof raw.label !== "string") return null;
  const agent = typeof raw.agent === "string" ? detectAICLI(raw.agent) : null;
  return {
    label: raw.label,
    ...(optString(raw.actionName) ? { actionName: optString(raw.actionName) } : {}),
    ...(agent ? { agent } : {}),
    ...(optString(raw.emoji) ? { emoji: optString(raw.emoji) } : {}),
    ...(optString(raw.color) ? { color: optString(raw.color) } : {}),
  };
}

function normalizeNode(raw: unknown): SavedLayoutNode | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "leaf") {
    const tabs = Array.isArray(raw.tabs)
      ? raw.tabs.map(normalizeTab).filter((t): t is SavedLayoutTab => t !== null)
      : [];
    const idx = typeof raw.activeTabIdx === "number" ? raw.activeTabIdx : 0;
    return { kind: "leaf", tabs, activeTabIdx: clampIdx(idx, tabs.length) };
  }
  if (raw.kind !== "split") return null;
  const a = normalizeNode(raw.a);
  const b = normalizeNode(raw.b);
  if (!a || !b) return a ?? b;
  const ratio = typeof raw.ratio === "number" ? Math.min(0.95, Math.max(0.05, raw.ratio)) : 0.5;
  return { kind: "split", direction: raw.direction === "col" ? "col" : "row", ratio, a, b };
}

/** The setting as read from disk, with anything malformed left out. */
export function normalizeSavedLayouts(raw: unknown): SavedLayoutsConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const out: SavedLayoutsConfig = {};
  for (const [owner, value] of Object.entries(raw)) {
    if (!isRecord(value) || !Array.isArray(value.layouts)) continue;
    const layouts = value.layouts.flatMap((l): SavedLayout[] => {
      if (!isRecord(l) || typeof l.id !== "string" || typeof l.name !== "string") return [];
      const root = normalizeNode(l.root);
      return root ? [{ id: l.id, name: l.name, root }] : [];
    });
    if (layouts.length === 0) continue;
    const defaultId = layouts.some((l) => l.id === value.defaultId) ? (value.defaultId as string) : undefined;
    out[owner] = defaultId ? { layouts, defaultId } : { layouts };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
