import { useProjectLayouts } from "../../hooks/useSavedLayouts";
import type { SavedLayoutNode } from "../../savedLayouts";
import { LayoutThumb } from "../terminal/LayoutThumb";
import { LAUNCHPAD_CAPTION } from "./launchpadTabStyle";


// The project's saved layouts on its empty launchpad, where there is no pane
// header yet to open one from.
export function LaunchpadLayouts({
  projectName,
  onOpen,
}: {
  projectName: string;
  onOpen: (root: SavedLayoutNode) => void;
}) {
  const { layouts, defaultId } = useProjectLayouts(projectName);
  if (layouts.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`${LAUNCHPAD_CAPTION} px-2.5`}>Layouts</span>
      <div className="flex flex-wrap gap-1.5 px-1.5">
        {layouts.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => onOpen(layout.root)}
            className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <LayoutThumb node={layout.root} />
            <span className="truncate">{layout.name}</span>
            {layout.id === defaultId && <span className="text-[11px] text-[var(--text-muted)]">Default</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
