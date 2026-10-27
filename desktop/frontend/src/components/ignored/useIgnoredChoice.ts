import { useCallback, useEffect, useRef, useState } from "react";
import { toggle, withEnvFiles } from "./ignoredSelection";
import { indexTree, parentOf, suggested, trackedFolders, type TreeNode } from "./ignoredTree";

export interface IgnoredChoice {
  sel: ReadonlySet<string>;
  open: ReadonlySet<string>;
  tick: (node: TreeNode) => void;
  setOpen: (path: string, open: boolean) => void;
  collapseAll: () => void;
  suggest: () => void;
  addEnvFiles: () => void;
  clear: () => void;
}

function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  for (let p = parentOf(path); p; p = parentOf(p)) out.unshift(p);
  return out;
}

/// What is ticked and opened in the tree. It starts from `saved`, what already
/// syncs, or when nothing does (null) the suggestions, plus — from the Files tab
/// or a conflict — the path that brought the dialog up.
export function useIgnoredChoice(
  tree: TreeNode[] | null,
  saved: string[] | null,
  focus: string | undefined,
  loadDir: (path: string) => void,
): IgnoredChoice {
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpenSet] = useState<ReadonlySet<string>>(new Set());
  const seeded = useRef(false);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!tree || seeded.current) return;
    seeded.current = true;
    setOpenSet(new Set([...trackedFolders(tree), ...(focus ? ancestorsOf(focus) : [])]));
    const start = saved ? new Set(saved) : suggested(tree);
    if (focus) start.add(focus);
    setSel(start);
  }, [tree, saved, focus]);

  // Opening the way to a path inside folders not listed yet: each one is read
  // as the one above it arrives.
  useEffect(() => {
    if (!tree || !focus) return;
    const index = indexTree(tree);
    for (const dir of ancestorsOf(focus)) {
      const node = index.get(dir);
      if (node?.ignored && node.children === null && !asked.current.has(dir)) {
        asked.current.add(dir);
        loadDir(dir);
        return;
      }
    }
  }, [tree, focus, loadDir]);

  const tick = useCallback((node: TreeNode) => tree && setSel((s) => toggle(node, tree, s)), [tree]);

  const setOpen = useCallback((path: string, on: boolean) => {
    setOpenSet((s) => {
      const next = new Set(s);
      if (on) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  return {
    sel,
    open,
    tick,
    setOpen,
    collapseAll: () => setOpenSet(new Set()),
    suggest: () => tree && setSel(suggested(tree)),
    addEnvFiles: () => tree && setSel((s) => withEnvFiles(tree, s)),
    clear: () => setSel(new Set()),
  };
}
