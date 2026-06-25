import { splitChild } from "./actionIds";
import type { ExtractIndicator } from "./components/actionsDndLayout";

export type StructuralOp =
  | { kind: "nest"; source: string; target: string }
  | { kind: "ungroup"; path: string }
  | {
      kind: "extractOnto";
      parent: string;
      child: string;
      target: string;
      over?: string;
      position?: "before" | "after";
    }
  | { kind: "extractToTop"; parent: string; child: string; group?: "header" | "footer"; index?: number }
  | { kind: "reorderMenu"; parent: string; child: string; over: string; position?: "before" | "after" };

export interface GestureInput {
  draggedId: string;
  draggedIsMenu: boolean;
  overNestTarget: string | null;
  overItemId: string | null;
  sameLevel: boolean;
  // Insertion gap an extracted item would land in; without one it appends.
  extractTarget: ExtractIndicator | null;
  // Set when the pointer is over a breadcrumb crumb of the open drill menu.
  // "" means the toolbar/root crumb; a path means that ancestor level.
  crumbTarget?: string | null;
  // Which side of the over row a within-menu reorder lands on, from the
  // pointer's third. Absent for a plain (swap-style) reorder.
  reorderPosition?: "before" | "after";
}

// The action whose config level decides which layer a structural op edits.
export function structuralSubject(op: StructuralOp): string {
  if (op.kind === "ungroup") return op.path;
  return op.kind === "nest" ? op.source : op.parent;
}

export function detectGesture(input: GestureInput): StructuralOp | null {
  const { draggedId, draggedIsMenu, overNestTarget, overItemId, sameLevel, crumbTarget } = input;
  const childRef = splitChild(draggedId);

  // Breadcrumb drop: move out to an ancestor level (or to the toolbar).
  if (childRef && crumbTarget != null) {
    if (crumbTarget === "") {
      return {
        kind: "extractToTop",
        parent: childRef.parent,
        child: childRef.child,
        group: input.extractTarget?.group,
        index: input.extractTarget?.index,
      };
    }
    if (crumbTarget === childRef.parent) return null; // dropping on its own level = no-op
    return { kind: "extractOnto", parent: childRef.parent, child: childRef.child, target: crumbTarget };
  }

  if (overNestTarget !== null) {
    if (!sameLevel) return null;
    if (overNestTarget === draggedId) return null;
    if (childRef) {
      if (childRef.parent === overNestTarget) return null;
      return { kind: "extractOnto", parent: childRef.parent, child: childRef.child, target: overNestTarget };
    }
    // Preserve structure: a dragged menu nests whole.
    return { kind: "nest", source: draggedId, target: overNestTarget };
  }

  if (childRef) {
    if (overItemId) {
      const oc = splitChild(overItemId);
      if (oc) {
        if (oc.parent === childRef.parent) {
          return {
            kind: "reorderMenu",
            parent: childRef.parent,
            child: childRef.child,
            over: oc.child,
            ...(input.reorderPosition ? { position: input.reorderPosition } : {}),
          };
        }
        // Cross-level before/after: the over row lives in a different menu (the
        // user spring-navigated up mid-drag). Move the child into that menu at
        // the indicated side instead of extracting to the toolbar.
        if (input.reorderPosition) {
          return {
            kind: "extractOnto",
            parent: childRef.parent,
            child: childRef.child,
            target: oc.parent,
            over: oc.child,
            position: input.reorderPosition,
          };
        }
      }
    }
    return {
      kind: "extractToTop",
      parent: childRef.parent,
      child: childRef.child,
      group: input.extractTarget?.group,
      index: input.extractTarget?.index,
    };
  }

  return null;
}
