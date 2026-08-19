import { FolderIcon } from "./icons";
import { SidebarHeaderShell } from "./SidebarHeaderShell";
import { SidebarRollupLine } from "./SidebarRollupLine";
import type { RollupSegment } from "./sidebarRollup";
import type { ProjectGroup } from "../types";

interface SidebarGroupRowProps {
  group: ProjectGroup;
  collapsed: boolean;
  count: number;
  /** What the fold is hiding, already rolled up by the sidebar. */
  segments: RollupSegment[];
  containsSelected: boolean;
  selectMode: boolean;
  isContextTarget: boolean;
  onToggle: () => void;
  onMore: (x: number, y: number) => void;
}

export function SidebarGroupRow({
  group,
  collapsed,
  count,
  segments,
  containsSelected,
  selectMode,
  isContextTarget,
  onToggle,
  onMore,
}: SidebarGroupRowProps) {
  const speaking = collapsed && segments.length > 0;
  return (
    <SidebarHeaderShell
      glyph={<FolderIcon />}
      // Expanded, the plate has nothing to say but "rows follow", so the chevron
      // holds it at rest; collapsed, the folder glyph earns the square back.
      chevronAtRest={!collapsed}
      expanded={!collapsed}
      line1={
        <span
          // Rests at the sidebar's shared tone whether folded or not, and
          // brightens the way a row would: under the cursor, or while the fold
          // is the selection's only trace.
          className={`min-w-0 truncate text-[13px] font-medium leading-5 group-hover/hdr:text-[var(--text-primary)] ${
            containsSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          }`}
          title={group.name}
        >
          {group.name}
        </span>
      }
      line2={speaking ? <SidebarRollupLine segments={segments} /> : undefined}
      trailing={
        // Plain: the numeral only ever shows when there is nothing to report,
        // because any state worth a tint has already claimed the second line.
        count > 0 ? (
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{count}</span>
        ) : undefined
      }
      active={containsSelected}
      isContextTarget={isContextTarget}
      showMore={!selectMode}
      moreLabel={`Options for folder ${group.name}`}
      onToggle={onToggle}
      onMore={onMore}
    />
  );
}
