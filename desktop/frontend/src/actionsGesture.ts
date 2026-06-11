import { splitChild } from "./actionIds";
import type { ExtractIndicator } from "./components/actionsDndLayout";

export type StructuralOp =
  | { kind: "nest"; source: string; target: string }
  | { kind: "merge"; source: string; target: string }
  | { kind: "extractOnto"; parent: string; child: string; target: string }
  | { kind: "extractToTop"; parent: string; child: string; group?: "header" | "footer"; index?: number }
  | { kind: "reorderMenu"; parent: string; child: string; over: string };

export interface GestureInput {
  draggedId: string;
  draggedIsMenu: boolean;
  overNestTarget: string | null;
  overItemId: string | null;
  sameLevel: boolean;
  // Insertion gap an extracted item would land in; without one it appends.
  extractTarget: ExtractIndicator | null;
}

// The action whose config level decides which layer a structural op edits.
export function structuralSubject(op: StructuralOp): string {
  return op.kind === "nest" || op.kind === "merge" ? op.source : op.parent;
}

export function detectGesture(input: GestureInput): StructuralOp | null {
  const { draggedId, draggedIsMenu, overNestTarget, overItemId, sameLevel } = input;
  const childRef = splitChild(draggedId);

  if (overNestTarget !== null) {
    if (!sameLevel) return null;
    if (overNestTarget === draggedId) return null;
    if (childRef) {
      if (childRef.parent === overNestTarget) return null;
      return { kind: "extractOnto", parent: childRef.parent, child: childRef.child, target: overNestTarget };
    }
    return draggedIsMenu
      ? { kind: "merge", source: draggedId, target: overNestTarget }
      : { kind: "nest", source: draggedId, target: overNestTarget };
  }

  if (childRef) {
    if (overItemId) {
      const oc = splitChild(overItemId);
      if (oc && oc.parent === childRef.parent) {
        return { kind: "reorderMenu", parent: childRef.parent, child: childRef.child, over: oc.child };
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
