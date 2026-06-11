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
}

function splitChild(id: string): { parent: string; child: string } | null {
  const i = id.indexOf(":");
  if (i < 0) return null;
  return { parent: id.slice(0, i), child: id.slice(i + 1) };
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
    return { kind: "extractToTop", parent: childRef.parent, child: childRef.child };
  }

  return null;
}
