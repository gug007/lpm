import { useMemo, useState } from "react";
import { ServerIcon } from "./icons";
import { LaptopIcon } from "./connections/LaptopIcon";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { peerRawName, peerSlugOf, stripMarker } from "../peer/markers";
import { SidebarPeerRow } from "./SidebarPeerRow";
import { SidebarHeaderShell } from "./SidebarHeaderShell";
import { SidebarRollupLine } from "./SidebarRollupLine";
import { PeerContextMenu } from "./PeerContextMenu";
import { peerPlateClass } from "./peerPlate";
import { ROLLUP_SEPARATOR_CLASS, rollupSegments } from "./sidebarRollup";
import { SortableItem } from "./ui/SortableList";
import { peerRowToken } from "./peerRowOrder";
import { FollowIndicator } from "./FollowIndicator";
import type { MirrorRow } from "./peerSections";
import type { PeerStatus } from "../peer/peerStatus";
import type { FollowState } from "../followApi";
import { isPeerSectionCollapsed, setPeerSectionCollapsed } from "../peer/peerSectionCollapse";
import { PeerReconnect, PeerRemove } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import type { ProjectInfo } from "../types";

// A machine's name is the one thing the header has to get across, and the width
// it has is never generous. Both shapes a name comes in have a part that can go:
// an address keeps its last octet (the octet that differs) and gives up the
// prefix; a hostname keeps everything up to its first separator and lets the
// suffix — the domain, the model, the "-pro" — fade out instead.
//
// Only ONE of the two halves may be elastic. Flexbox distributes a shortfall
// across every shrinkable child in proportion, so if both can give way, a
// fraction of a pixel of deficit puts an ellipsis on both at once.
const ADDRESS = /^\d{1,3}(\.\d{1,3}){3}$/;

function splitAlias(alias: string): { head: string; tail: string; address: boolean } {
  if (ADDRESS.test(alias)) {
    const cut = alias.lastIndexOf(".");
    return { head: alias.slice(0, cut + 1), tail: alias.slice(cut + 1), address: true };
  }
  const cut = alias.search(/[-.]/);
  if (cut <= 0) return { head: alias, tail: "", address: false };
  return { head: alias.slice(0, cut), tail: alias.slice(cut), address: false };
}

// A paired Mac's projects, rendered as a flat section headed by the Mac's name.
// The header collapses the section, holds its whole menu behind one ⋮, and — as
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
  host,
  connected,
  linuxHost,
  status,
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
  /// The address behind the alias, for the name's tooltip.
  host: string;
  connected: boolean;
  /// Which machine this is, for the header's glyph.
  linuxHost: boolean;
  /// How it is doing, for the header's plate and its second line.
  status: PeerStatus;
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

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
  // Folded away, the header is the only thing left to say the open project is in
  // here — the same job a collapsed folder's background does.
  const holdsSelection =
    collapsed &&
    selected !== null &&
    (projects.some((p) => p.name === selected) ||
      strays.some((stray) => stray.project.name === selected));
  // A copy is a project of this Mac's just as much as a row of its own is, so
  // the header speaks for both.
  const segments = useMemo(
    () => rollupSegments([...projects, ...strays.map((stray) => stray.project)]),
    [projects, strays],
  );

  const { head, tail, address } = splitAlias(alias);
  // Metrics only. The two halves wear different tones, and a span carrying two
  // colour utilities at once is settled by stylesheet order rather than intent —
  // which is how a muted tail ends up the same colour as its head.
  const nameMetrics = "truncate text-[13px] font-medium leading-5 tabular-nums";
  // Rests at the same tone every other sidebar name does — a folded section is
  // not news — and brightens only the way a row would: under the cursor, or
  // while it is the selection's only trace.
  const headTone = holdsSelection
    ? "text-[var(--text-primary)]"
    : "text-[var(--text-secondary)]";
  const line1 = (
    // Bounded and elastic as a pair, so the name gives way to the row count
    // rather than pushing it out from under the reserve the ⋮ sits in.
    <span className="flex min-w-0 flex-1 items-baseline">
      <span
        className={`${nameMetrics} ${headTone} group-hover/hdr:text-[var(--text-primary)] ${
          // Only the half that can be spared is elastic. An address gives up its
          // prefix to keep the octet that differs; a hostname holds its first
          // word and spends the suffix. With nothing to spare it truncates
          // plainly, like a folder's name.
          address || !tail ? "min-w-0" : "min-w-0 max-w-full flex-none"
        }`}
        title={host || alias}
      >
        {head}
      </span>
      {tail && (
        <span
          className={`${nameMetrics} ${
            address ? `${headTone} flex-none` : "min-w-0 text-[var(--text-muted)]"
          }`}
        >
          {tail}
        </span>
      )}
    </span>
  );

  // What the machine itself is doing is news at either height — no row can say
  // it. What its projects are doing is only news while they are hidden.
  const line2 = (() => {
    if (status.tone === "error")
      return <span className="text-[var(--accent-red-text)]">{status.text}</span>;
    if (status.tone === "pending") return <span>{status.text}</span>;
    if (status.tone === "off")
      return (
        <>
          {/* Not amber: amber is what a blocked agent wears, and a sleeping Mac
              is not asking for anything. */}
          <span>Away</span>
          {strays.length > 0 && (
            <>
              <span className={ROLLUP_SEPARATOR_CLASS}>·</span>
              <span>{strays.length === 1 ? "1 copy here" : `${strays.length} copies here`}</span>
            </>
          )}
        </>
      );
    if (!collapsed || segments.length === 0) return undefined;
    return <SidebarRollupLine segments={segments} />;
  })();

  const header = (
    <SidebarHeaderShell
      glyph={linuxHost ? <ServerIcon /> : <LaptopIcon size={11} />}
      plateClass={peerPlateClass(status.tone)}
      expanded={!collapsed}
      line1={line1}
      line2={line2}
      trailing={
        collapsed && rowCount > 0 ? (
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{rowCount}</span>
        ) : undefined
      }
      active={holdsSelection}
      isContextTarget={menu !== null}
      showMore
      moreLabel={`Options for ${alias}`}
      onToggle={toggle}
      onMore={(x, y) => setMenu({ x, y })}
    />
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

      {menu && (
        <PeerContextMenu
          x={menu.x}
          y={menu.y}
          alias={alias}
          connected={connected}
          canReconnect={status.tone === "error"}
          onAddProject={() => addProjectForPeer(slug, alias)}
          onReconnect={() => void PeerReconnect(slug)}
          onDisconnect={() => setConfirmOpen(true)}
          onClose={() => setMenu(null)}
        />
      )}

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
