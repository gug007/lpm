// Tabs on their way to another project's tab tree (tabMove.ts). The tree they
// leave sees them go like a closed tab, but their terminal session is the one
// the other project shows next, scrollback and all, so it must not be torn down.
const moving = new Set<string>();

export function markMoving(id: string): void {
  moving.add(id);
}

// True once for a moving tab, as the tree it left lets it go.
export function takeMoving(id: string): boolean {
  return moving.delete(id);
}
