import { useMemo, useState, type ReactNode } from "react";
import { toast } from "../notifications/toast";
import { ServerIcon } from "./icons";
import { LaptopIcon } from "./connections/LaptopIcon";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { RenameModal } from "./RenameModal";
import { PairingModal } from "./PairingModal";
import { usePairingFlow } from "./mobile/usePairingFlow";
import { peerCommands } from "./settings/machineCommands";
import { peerSlugOf } from "../peer/markers";
import { SidebarHeaderShell } from "./SidebarHeaderShell";
import { SidebarRollupLine } from "./SidebarRollupLine";
import { PeerContextMenu } from "./PeerContextMenu";
import { peerPlateClass } from "./peerPlate";
import { ROLLUP_SEPARATOR_CLASS, rollupSegments } from "./sidebarRollup";
import { SortableItem } from "./ui/SortableList";
import type { EdgeAgentState } from "../sidebarAgentEdges";
import type { MirrorRow } from "./peerSections";
import type { PeerStatus } from "../peer/peerStatus";
import type { PeerNoun } from "../peer/platform";
import { isMac } from "../platform";
import { isPeerSectionCollapsed, setPeerSectionCollapsed } from "../peer/peerSectionCollapse";
import { PeerReconnect, PeerRemove, PeerSetAlias } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { hasPeerListing } from "../peer/route";
import { SidebarHostEmptyRow } from "./SidebarHostEmptyRow";
import type { UpdateChannel } from "../store/settings";
import type { ProjectInfo } from "../types";
import { useMacUpdateLine } from "../peer/useMacUpdateLine";
import { MACHINE } from "../machineWords";

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

// A paired Mac's projects, in a section headed by the Mac's name. The header
// collapses the section, holds its whole menu behind one ⋮, and — as the
// section's drag handle — carries it to wherever the user wants it among the
// local projects and folders. The rows under it are the Sidebar's own project
// rows and decks, so a remote project shows everything a local one does; they
// drag among themselves (see peerRowOrder), while the synced copies below them
// are pinned, since they are here only for as long as that Mac is away.
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
  noun = linuxHost ? "server" : "Mac",
  status,
  version,
  selfUpdate,
  updateChannel,
  projects,
  strays,
  selected,
  edgeAgent,
  children,
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
  /// What its dialogs call it.
  noun?: PeerNoun;
  /// How it is doing, for the header's plate and its second line.
  status: PeerStatus;
  /// The lpm it runs, and whether it can be updated from here.
  version: string;
  selfUpdate: boolean;
  updateChannel?: UpdateChannel;
  projects: ProjectInfo[];
  /// Copies with no row of this Mac's own to mark.
  strays: MirrorRow[];
  selected: string | null;
  /// The agents its projects hold, for the line at the end of the list once
  /// folding the section leaves the header to speak for them.
  edgeAgent?: EdgeAgentState;
  /// The section's rows, shown while it is open.
  children: ReactNode;
}) {
  const clearSelection = useAppStore((s) => s.clearSelection);
  const addProjectForPeer = useAppStore((s) => s.addProjectForPeer);
  const openMachineSettings = useAppStore((s) => s.openMachineSettings);
  const [collapsed, setCollapsed] = useState(() => isPeerSectionCollapsed(slug));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // The QR minted by this machine for a phone to scan, and why one couldn't be.
  const phonePairing = usePairingFlow();
  const [phonePairError, setPhonePairError] = useState<string | null>(null);

  const pairPhone = async () => {
    if (phonePairing.busy) return;
    try {
      await phonePairing.start(peerCommands(slug).mobile);
    } catch (err) {
      setPhonePairError(String(err));
    }
  };

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
  // Said only once the machine has answered, so a list still on its way never
  // reads as an empty one.
  const empty = rowCount === 0 && status.tone === "live" && hasPeerListing(slug);
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

  // Updating it is news at either height, and outranks what its projects are
  // doing: the restart it ends in is what every one of them is about to do.
  const { line: updateLine, act: onUpdateAction } = useMacUpdateLine(slug, alias, {
    connected,
    supportsSelfUpdate: selfUpdate,
    version,
    updateChannel,
  });

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
  // it. The one exception is a failure: folded, the plate is already red, and a
  // line of red under the name costs the count of what is hidden to repeat it.
  // What its projects are doing is only news while they are hidden.
  const line2 = (() => {
    if (updateLine)
      return updateLine.kind === "done" ? (
        <span className="text-[var(--accent-green-text)]">{updateLine.text}</span>
      ) : (
        <span>{updateLine.text}</span>
      );
    if (status.tone === "error" && !collapsed)
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
      line2Action={
        updateLine?.action && {
          label: updateLine.action.label,
          tone: updateLine.action.kind === "update" ? "accent" : "muted",
          onClick: onUpdateAction,
        }
      }
      trailing={
        collapsed && rowCount > 0 ? (
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{rowCount}</span>
        ) : undefined
      }
      edgeAgent={collapsed ? edgeAgent : undefined}
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
      {!collapsed && children}
      {!collapsed && empty && <SidebarHostEmptyRow alias={alias} onAdd={() => addProjectForPeer(slug, alias)} />}

      {menu && (
        <PeerContextMenu
          x={menu.x}
          y={menu.y}
          alias={alias}
          connected={connected}
          canReconnect={status.tone === "error" || !!status.reconnect}
          onAddProject={() => addProjectForPeer(slug, alias)}
          onPairPhone={() => void pairPhone()}
          onSettings={() => openMachineSettings(slug)}
          updateLabel={
            updateLine?.action?.kind === "update" ? updateLine.action.label : undefined
          }
          onUpdate={onUpdateAction}
          onRename={() => setRenameOpen(true)}
          onReconnect={() => void PeerReconnect(slug)}
          onDisconnect={() => setConfirmOpen(true)}
          onClose={() => setMenu(null)}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        // On macOS a server's section keeps the title it has always had.
        title={isMac && noun === "server" ? "Disconnect Mac" : `Disconnect ${noun}`}
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Disconnect from{" "}
            <span className="font-medium text-[var(--text-primary)]">{alias}</span>? Its projects
            will no longer appear here, and {MACHINE.thisMachine} is removed there too.
          </>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRemove}
      />

      <RenameModal
        open={renameOpen}
        title={`Rename ${noun}`}
        description={`The name ${MACHINE.thisMachine} lists it under. Nothing changes on the machine itself.`}
        initialValue={alias}
        onClose={() => setRenameOpen(false)}
        onSubmit={(value) => void PeerSetAlias(slug, value)}
      />

      <PairingModal
        pairing={phonePairing.pairing}
        machine={alias}
        outcome={phonePairing.outcome}
        busy={phonePairing.busy}
        onClose={phonePairing.close}
        onNewCode={() => void pairPhone()}
        onRename={(id, name) =>
          void phonePairing.rename(id, name).catch((err) => toast.error(`Couldn't rename it — ${String(err)}`))
        }
      />

      <ConfirmDialog
        open={phonePairError !== null}
        title="Couldn't get a pairing code"
        confirmLabel="Try Again"
        body={
          <>
            <span className="font-medium text-[var(--text-primary)]">{alias}</span> didn&#39;t hand
            back a pairing code — {phonePairError}
          </>
        }
        onCancel={() => setPhonePairError(null)}
        onConfirm={() => {
          setPhonePairError(null);
          void pairPhone();
        }}
      />
    </div>
  );
}
