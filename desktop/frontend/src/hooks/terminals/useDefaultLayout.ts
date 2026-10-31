import { useEffect, type RefObject } from "react";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { collectTerminals, type PaneNode } from "../../paneTree";
import { isPeerName } from "../../peer/markers";
import type { SavedLayoutNode } from "../../savedLayouts";
import { defaultLayoutFor } from "../useSavedLayouts";

/** Opens the project's default layout once its restore finds no terminals. A
 *  paired Mac's project is left alone: its host brings back its own tabs. */
export function useDefaultLayout(
  projectName: string,
  treeRef: RefObject<PaneNode | null>,
  restoreSettled: RefObject<Promise<void>>,
  applyLayout: (root: SavedLayoutNode) => Promise<void>,
) {
  useEffect(() => {
    if (IS_MIRROR_WINDOW || isPeerName(projectName)) return;
    let cancelled = false;
    void restoreSettled.current.then(() => {
      if (cancelled) return;
      const current = treeRef.current;
      if (current && collectTerminals(current).length > 0) return;
      const layout = defaultLayoutFor(projectName);
      if (layout) void applyLayout(layout.root);
    });
    return () => {
      cancelled = true;
    };
    // Once per mount, like the restore it follows: a second run while the
    // first layout is still starting would open it twice.
  }, [projectName]);
}
