// A minimal binary split-pane layout for the remote view — the capability the
// local pane strip exposes (split row/col + close), no more. Each leaf hosts one
// remote terminal mirror; a split arranges two children side-by-side ("row") or
// stacked ("col"). Pure reducers so the layout logic is unit-tested without React.

export type RemotePaneNode =
  | { kind: "leaf"; id: string; terminalId: string | null }
  | { kind: "split"; id: string; dir: "row" | "col"; a: RemotePaneNode; b: RemotePaneNode };

let seq = 0;
export function paneId(): string {
  seq += 1;
  return `pane-${seq}`;
}

export function leaf(terminalId: string | null): RemotePaneNode {
  return { kind: "leaf", id: paneId(), terminalId };
}

// Replace the target leaf with a split of [target, new leaf].
export function splitLeaf(
  tree: RemotePaneNode,
  targetId: string,
  dir: "row" | "col",
  newTerminalId: string | null,
): RemotePaneNode {
  if (tree.kind === "leaf") {
    if (tree.id !== targetId) return tree;
    return { kind: "split", id: paneId(), dir, a: tree, b: leaf(newTerminalId) };
  }
  return {
    ...tree,
    a: splitLeaf(tree.a, targetId, dir, newTerminalId),
    b: splitLeaf(tree.b, targetId, dir, newTerminalId),
  };
}

// Remove the target leaf, collapsing its parent split to the sibling. The last
// remaining leaf can't be removed (returns the tree unchanged).
export function closeLeaf(tree: RemotePaneNode, targetId: string): RemotePaneNode {
  if (tree.kind === "leaf") return tree;
  if (tree.a.kind === "leaf" && tree.a.id === targetId) return tree.b;
  if (tree.b.kind === "leaf" && tree.b.id === targetId) return tree.a;
  return { ...tree, a: closeLeaf(tree.a, targetId), b: closeLeaf(tree.b, targetId) };
}

export function setLeafTerminal(
  tree: RemotePaneNode,
  targetId: string,
  terminalId: string | null,
): RemotePaneNode {
  if (tree.kind === "leaf") return tree.id === targetId ? { ...tree, terminalId } : tree;
  return {
    ...tree,
    a: setLeafTerminal(tree.a, targetId, terminalId),
    b: setLeafTerminal(tree.b, targetId, terminalId),
  };
}

export type RemotePaneLeaf = Extract<RemotePaneNode, { kind: "leaf" }>;

export function leaves(tree: RemotePaneNode): RemotePaneLeaf[] {
  return tree.kind === "leaf" ? [tree] : [...leaves(tree.a), ...leaves(tree.b)];
}

// Drop leaves whose terminal is gone (closed remotely), collapsing splits; keep
// at least one leaf (retargeted to null so the pane shows a picker).
export function pruneToTerminals(tree: RemotePaneNode, liveIds: Set<string>): RemotePaneNode {
  const stale = leaves(tree).filter((l) => l.terminalId && !liveIds.has(l.terminalId));
  let next = tree;
  for (const l of stale) {
    if (leaves(next).length <= 1) {
      next = setLeafTerminal(next, l.id, null);
    } else {
      next = closeLeaf(next, l.id);
    }
  }
  return next;
}
