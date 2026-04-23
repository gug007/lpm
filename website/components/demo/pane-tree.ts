export type SplitDirection = "row" | "col";

export type LeafContent =
  | { kind: "service"; name: string }
  | { kind: "shell"; id: string }
  | { kind: "action"; key: string; label: string };

export interface PaneLeaf {
  kind: "leaf";
  id: string;
  tabs: LeafContent[];
  activeTabIdx: number;
}

export interface PaneSplit {
  kind: "split";
  direction: SplitDirection;
  ratio: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

function rand(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

export function newShellContent(): LeafContent {
  return { kind: "shell", id: `sh-${Date.now().toString(36)}-${rand(4)}` };
}

function newLeafId(): string {
  return `p-${Date.now().toString(36)}-${rand(4)}`;
}

export function makeLeaf(content: LeafContent): PaneLeaf {
  return { kind: "leaf", id: newLeafId(), tabs: [content], activeTabIdx: 0 };
}

export function tabKey(content: LeafContent): string {
  if (content.kind === "service") return `s:${content.name}`;
  if (content.kind === "shell") return `sh:${content.id}`;
  return `a:${content.key}`;
}

export function findLeaf(node: PaneNode, id: string): PaneLeaf | null {
  if (node.kind === "leaf") return node.id === id ? node : null;
  return findLeaf(node.a, id) ?? findLeaf(node.b, id);
}

export function collectLeaves(node: PaneNode | null): PaneLeaf[] {
  if (!node) return [];
  if (node.kind === "leaf") return [node];
  return [...collectLeaves(node.a), ...collectLeaves(node.b)];
}

export function collectServiceNames(node: PaneNode | null): string[] {
  const out: string[] = [];
  for (const leaf of collectLeaves(node)) {
    for (const tab of leaf.tabs) {
      if (tab.kind === "service") out.push(tab.name);
    }
  }
  return out;
}

export function mapLeaf(
  node: PaneNode,
  leafId: string,
  fn: (leaf: PaneLeaf) => PaneLeaf,
): PaneNode {
  if (node.kind === "leaf") return node.id === leafId ? fn(node) : node;
  const a = mapLeaf(node.a, leafId, fn);
  const b = mapLeaf(node.b, leafId, fn);
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

export function replaceLeaf(
  node: PaneNode,
  leafId: string,
  replacement: PaneNode,
): PaneNode {
  if (node.kind === "leaf") return node.id === leafId ? replacement : node;
  const a = replaceLeaf(node.a, leafId, replacement);
  const b = replaceLeaf(node.b, leafId, replacement);
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

export function splitAtLeaf(
  node: PaneNode,
  leafId: string,
  direction: SplitDirection,
  newLeaf: PaneLeaf,
): PaneNode {
  const existing = findLeaf(node, leafId);
  if (!existing) return node;
  return replaceLeaf(node, leafId, {
    kind: "split",
    direction,
    ratio: 0.5,
    a: existing,
    b: newLeaf,
  });
}

export function removeLeaf(
  node: PaneNode,
  leafId: string,
): PaneNode | null {
  if (node.kind === "leaf") return node.id === leafId ? null : node;
  const a = removeLeaf(node.a, leafId);
  if (a === null) return node.b;
  const b = removeLeaf(node.b, leafId);
  if (b === null) return node.a;
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

export function setRatioAtPath(
  node: PaneNode,
  path: number[],
  ratio: number,
): PaneNode {
  if (path.length === 0) {
    if (node.kind !== "split") return node;
    const clamped = Math.max(0.08, Math.min(0.92, ratio));
    return clamped === node.ratio ? node : { ...node, ratio: clamped };
  }
  if (node.kind !== "split") return node;
  const [head, ...rest] = path;
  if (head === 0) {
    const a = setRatioAtPath(node.a, rest, ratio);
    return a === node.a ? node : { ...node, a };
  }
  const b = setRatioAtPath(node.b, rest, ratio);
  return b === node.b ? node : { ...node, b };
}

export function appendLeaf(
  node: PaneNode | null,
  leaf: PaneLeaf,
  direction: SplitDirection = "row",
): PaneNode {
  if (!node) return leaf;
  return { kind: "split", direction, ratio: 0.5, a: node, b: leaf };
}

export function addTabToLeaf(
  node: PaneNode,
  leafId: string,
  content: LeafContent,
): PaneNode {
  return mapLeaf(node, leafId, (leaf) => ({
    ...leaf,
    tabs: [...leaf.tabs, content],
    activeTabIdx: leaf.tabs.length,
  }));
}

export function closeTabInLeaf(
  node: PaneNode,
  leafId: string,
  tabIdx: number,
): PaneNode | null {
  const leaf = findLeaf(node, leafId);
  if (!leaf) return node;
  if (leaf.tabs.length <= 1) return removeLeaf(node, leafId);
  const newTabs = leaf.tabs.filter((_, i) => i !== tabIdx);
  let newIdx = leaf.activeTabIdx;
  if (newIdx === tabIdx) newIdx = Math.min(tabIdx, newTabs.length - 1);
  else if (newIdx > tabIdx) newIdx -= 1;
  return mapLeaf(node, leafId, (l) => ({ ...l, tabs: newTabs, activeTabIdx: newIdx }));
}

export function setActiveTab(
  node: PaneNode,
  leafId: string,
  idx: number,
): PaneNode {
  return mapLeaf(node, leafId, (leaf) => {
    if (idx < 0 || idx >= leaf.tabs.length) return leaf;
    if (leaf.activeTabIdx === idx) return leaf;
    return { ...leaf, activeTabIdx: idx };
  });
}

export function closeServiceTab(
  node: PaneNode,
  name: string,
): PaneNode | null {
  for (const leaf of collectLeaves(node)) {
    const idx = leaf.tabs.findIndex(
      (t) => t.kind === "service" && t.name === name,
    );
    if (idx !== -1) return closeTabInLeaf(node, leaf.id, idx);
  }
  return node;
}
