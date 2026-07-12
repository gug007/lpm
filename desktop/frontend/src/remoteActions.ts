import type { ActionInfo } from "./types";

// Flatten a project's action tree to its runnable leaves (nodes with no
// children), the same set the mobile client runs. Parent/menu nodes only group;
// the leaf's composite `name` is what `runAction` takes.
export function runnableActions(actions: ActionInfo[] | undefined): ActionInfo[] {
  const out: ActionInfo[] = [];
  const walk = (list: ActionInfo[]) => {
    for (const a of list) {
      if (a.children && a.children.length > 0) walk(a.children);
      else out.push(a);
    }
  };
  walk(actions ?? []);
  return out;
}
