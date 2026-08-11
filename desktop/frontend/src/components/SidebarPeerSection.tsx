import { useState } from "react";
import { ChevronRightIcon, PlusIcon, XIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { peerRawName, peerSlugOf, stripMarker } from "../peer/markers";
import { SidebarPeerRow } from "./SidebarPeerRow";
import { SortableItem } from "./ui/SortableList";
import { peerRowToken } from "./peerRowOrder";
import { FollowIndicator } from "./FollowIndicator";
import type { MirrorRow } from "./peerSections";
import type { FollowState } from "../followApi";
import { isPeerSectionCollapsed, setPeerSectionCollapsed } from "../peer/peerSectionCollapse";
import { PeerRemove } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import type { ProjectInfo } from "../types";

// A paired Mac's projects, rendered as a flat section headed by the Mac's name.
// The header collapses the section, offers a hover-revealed disconnect, and — as
// the section's drag handle — carries it to wherever the user wants it among the
// local projects and folders. The Mac's own rows drag among themselves the way
// local projects do (see peerRowOrder); the synced copies below them are pinned,
// since they are here only for as long as that Mac is away. Selecting a row opens
// the exact same ProjectDetail a local project uses.
//
// A Mac that is away keeps its section only for the copies synced here, so those
// stay runnable while it sleeps.
export function SidebarPeerSection({
  sortableId,
  slug,
  alias,
  connected,
  projects,
  mirrors,
  strays,
  follows,
  selected,
  contextTargetName,
  onSelect,
  onContextMenu,
}: {
  /// The section's slot in the sidebar order, making its header draggable.
  /// Omitted where there is no drag context (select mode).
  sortableId?: string;
  slug: string;
  alias: string;
  connected: boolean;
  projects: ProjectInfo[];
  /// The local synced folder for each of this Mac's project folders, keyed by that
  /// folder's path over there.
  mirrors: Map<string, ProjectInfo>;
  /// Copies with no row of this Mac's own to mark.
  strays: MirrorRow[];
  follows: Map<string, FollowState>;
  selected: string | null;
  contextTargetName?: string | null;
  onSelect: (name: string) => void;
  onContextMenu: (name: string, x: number, y: number) => void;
}) {
  const clearSelection = useAppStore((s) => s.clearSelection);
  const addProjectForPeer = useAppStore((s) => s.addProjectForPeer);
  const [collapsed, setCollapsed] = useState(() => isPeerSectionCollapsed(slug));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      setPeerSectionCollapsed(slug, next);
      return next;
    });
  };

  const confirmRemove = () => {
    const affectsSelection = peerSlugOf(selected) === slug;
    void PeerRemove(slug);
    if (affectsSelection) clearSelection();
    setConfirmOpen(false);
  };

  const rowCount = projects.length + strays.length;

  const header = (
    <div className="group/peer relative">
      <button
        onClick={toggle}
        className="flex w-full select-none items-center gap-1 rounded-md px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] group-hover/peer:pr-16"
      >
        <span
          className={`shrink-0 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
        >
          <ChevronRightIcon />
        </span>
        <span className="truncate">{alias}</span>
        <span className="shrink-0 opacity-70">{connected ? "— remote" : "— away"}</span>
        {collapsed && rowCount > 0 && (
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--text-muted)] transition-opacity group-hover/peer:opacity-0">
            {rowCount}
          </span>
        )}
      </button>
      {connected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            addProjectForPeer(slug, alias);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-8 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] pointer-events-none opacity-0 group-hover/peer:pointer-events-auto group-hover/peer:opacity-100 [&_svg]:h-3.5 [&_svg]:w-3.5"
          title={`Add project on ${alias}`}
          aria-label={`Add project on ${alias}`}
        >
          <PlusIcon />
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] pointer-events-none opacity-0 group-hover/peer:pointer-events-auto group-hover/peer:opacity-100"
        title={`Disconnect ${alias}`}
        aria-label={`Disconnect ${alias}`}
      >
        <XIcon />
      </button>
    </div>
  );

  // Spacing on both sides: a section can now sit between local rows, and its
  // last row would otherwise butt flush against the one below. Sibling margins
  // collapse, so stacked sections still show a single gap.
  return (
    <div className="my-3 first:mt-0">
      {sortableId ? <SortableItem id={sortableId}>{header}</SortableItem> : header}
      {!collapsed &&
        projects.map((project) => {
          const mirror = mirrors.get(stripMarker(project.root));
          const mirrorFollow = mirror && follows.get(mirror.name);
          const row = (
            <SidebarPeerRow
              project={project}
              label={project.label || peerRawName(project.name)}
              selected={selected === project.name}
              isContextTarget={contextTargetName === project.name}
              mark={
                mirror && mirrorFollow ? (
                  <FollowIndicator
                    follow={mirrorFollow}
                    macName={alias}
                    onOpen={() => onSelect(mirror.name)}
                  />
                ) : undefined
              }
              onSelect={() => onSelect(project.name)}
              onContextMenu={(x, y) => onContextMenu(project.name, x, y)}
            />
          );
          // Rows drag only where the header does — select mode has no drag
          // context to register them with.
          return sortableId ? (
            <SortableItem key={project.name} id={peerRowToken(project.name)}>
              {row}
            </SortableItem>
          ) : (
            <div key={project.name}>{row}</div>
          );
        })}
      {!collapsed &&
        strays.map((stray) => (
          <SidebarPeerRow
            key={stray.project.name}
            project={stray.project}
            label={stray.label}
            selected={selected === stray.project.name}
            isContextTarget={contextTargetName === stray.project.name}
            mark={<FollowIndicator follow={stray.follow} macName={alias} />}
            onSelect={() => onSelect(stray.project.name)}
            onContextMenu={(x, y) => onContextMenu(stray.project.name, x, y)}
          />
        ))}

      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect Mac"
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Disconnect from{" "}
            <span className="font-medium text-[var(--text-primary)]">{alias}</span>? Its projects
            will no longer appear here.
          </>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
