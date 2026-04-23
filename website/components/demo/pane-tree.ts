export type SplitDirection = "row" | "col";

export type LeafContent =
  | { kind: "service"; name: string }
  | { kind: "shell" }
  | { kind: "action"; key: string; label: string };

export interface PaneLeaf {
  kind: "leaf";
  id: string;
  content: LeafContent;
}

export interface PaneSplit {
  kind: "split";
  direction: SplitDirection;
  ratio: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export const leafIdForContent = (c: LeafContent): string =>
  c.kind === "service" ? `s:${c.name}` : c.kind === "shell" ? "" : `a:${c.key}`;

export function makeLeaf(content: LeafContent, shellIdSeq?: number): PaneLeaf {
  const id =
    content.kind === "shell"
      ? `t:${shellIdSeq ?? Date.now().toString(36)}`
      : leafIdForContent(content);
  return { kind: "leaf", id, content };
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
  return collectLeaves(node)
    .filter((l) => l.content.kind === "service")
    .map((l) => (l.content as { kind: "service"; name: string }).name);
}

export function replaceLeaf(
  node: PaneNode,
  id: string,
  replacement: PaneNode,
): PaneNode {
  if (node.kind === "leaf") return node.id === id ? replacement : node;
  const a = replaceLeaf(node.a, id, replacement);
  const b = replaceLeaf(node.b, id, replacement);
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

export function splitAtLeaf(
  node: PaneNode,
  id: string,
  direction: SplitDirection,
  newLeaf: PaneLeaf,
): PaneNode {
  const existing = findLeaf(node, id);
  if (!existing) return node;
  return replaceLeaf(node, id, {
    kind: "split",
    direction,
    ratio: 0.5,
    a: existing,
    b: newLeaf,
  });
}

export function removeLeaf(
  node: PaneNode,
  id: string,
): PaneNode | null {
  if (node.kind === "leaf") return node.id === id ? null : node;
  const a = removeLeaf(node.a, id);
  if (a === null) return node.b;
  const b = removeLeaf(node.b, id);
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

/**
 * Appends a leaf to the right edge of the tree as a new row split.
 * If the tree is null, the new leaf becomes the root.
 */
export function appendLeaf(
  node: PaneNode | null,
  leaf: PaneLeaf,
  direction: SplitDirection = "row",
): PaneNode {
  if (!node) return leaf;
  return { kind: "split", direction, ratio: 0.5, a: node, b: leaf };
}
