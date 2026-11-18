import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { MoreHorizontalIcon } from "../icons";
import { stripMarker } from "../../peer/markers";
import {
  copiesWord,
  rebuildableBytes,
  rebuildableKinds,
  type ArchivedProject,
  type ProjectSize,
} from "../../projectArchive";
import { fullStamp, relativeAgo } from "../../relativeTime";
import { formatBytes } from "../../syncApi";
import { PORT_ACTION } from "../ports/portsStyles";
import { StatusChip } from "../ui/StatusChip";
import { ARCHIVE_GRID } from "./archiveStyles";
import { ArchiveRowMenu } from "./ArchiveRowMenu";

interface ArchiveRowProps {
  project: ArchivedProject;
  // Absent while it's measured, null when it can't be.
  size: ProjectSize | null | undefined;
  // The paired machine it's on, when the page lists more than one.
  machineName?: string;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onUnarchive: () => void;
  onFree: () => void;
  onRemove: () => void;
  onTrash: () => void;
}

// The two biggest kinds say where the space went; the rest is "+N more".
const KINDS_SHOWN = 2;

function SizeCell({ size }: { size: ProjectSize | null | undefined }) {
  if (size === undefined) {
    return (
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <LoaderCircle size={12} className="animate-spin" aria-hidden />
        <span className="sr-only">Measuring</span>
      </span>
    );
  }
  if (size === null) return <span className="text-[var(--text-muted)]">—</span>;
  const rebuildable = rebuildableBytes(size);
  const kinds = rebuildableKinds([size]);
  const named = kinds.slice(0, KINDS_SHOWN).map((k) => `${formatBytes(k.bytes)} ${k.path}`);
  if (kinds.length > KINDS_SHOWN) named.push(`+${kinds.length - KINDS_SHOWN} more`);
  return (
    <span className="min-w-0">
      <span className="block tabular-nums text-[var(--text-primary)]">{formatBytes(size.bytes)}</span>
      {rebuildable > 0 && size.bytes > 0 && (
        <>
          <span
            className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--bg-active)]"
            role="img"
            aria-label={`${formatBytes(rebuildable)} of it can be rebuilt`}
          >
            <span
              className="block h-full rounded-full bg-[var(--accent-cyan)]"
              style={{ width: `${Math.max(3, Math.round((rebuildable / size.bytes) * 100))}%` }}
            />
          </span>
          <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]" title={named.join(" · ")}>
            {named.join(" · ")}
          </span>
        </>
      )}
    </span>
  );
}

export function ArchiveRow({
  project: p,
  size,
  machineName,
  selected,
  onToggle,
  onOpen,
  onUnarchive,
  onFree,
  onRemove,
  onTrash,
}: ArchiveRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const archivedSecs = Math.floor(p.archivedAt / 1000);
  const where = [
    stripMarker(p.root),
    machineName,
    p.copies > 0 ? `with ${copiesWord(p.copies)}` : "",
  ].filter(Boolean);

  return (
    <div
      className={`${ARCHIVE_GRID} group border-t border-[var(--border)] px-4 py-2.5 text-[13px] transition-colors first:border-t-0 ${
        selected || menuOpen ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]/50"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${p.label}`}
        className="h-3.5 w-3.5 accent-[var(--accent-cyan)]"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium text-[var(--text-primary)]">{p.label}</span>
        <span className="block truncate text-[12px] text-[var(--text-muted)]" title={where.join(" · ")}>
          {where.join(" · ")}
        </span>
      </span>
      <span
        className="truncate text-[var(--text-secondary)]"
        title={archivedSecs > 0 ? fullStamp(archivedSecs) : undefined}
      >
        {archivedSecs > 0 ? relativeAgo(archivedSecs) : "—"}
      </span>
      <SizeCell size={size} />
      <span>
        {p.automations > 0 ? (
          <StatusChip tone="attention">{p.automations} paused</StatusChip>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </span>
      <span className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          className={PORT_ACTION}
          title="Open it without unarchiving. Its automations stay paused."
        >
          Open
        </button>
        <button type="button" onClick={onUnarchive} className={PORT_ACTION}>
          Unarchive
        </button>
        <button
          ref={moreRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`More for ${p.label}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`${PORT_ACTION} w-7 justify-center px-0 ${menuOpen ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : ""}`}
        >
          <MoreHorizontalIcon />
        </button>
      </span>
      {menuOpen && moreRef.current && (
        <ArchiveRowMenu
          project={p}
          anchor={moreRef.current}
          rebuildable={rebuildableBytes(size)}
          onFree={onFree}
          onRemove={onRemove}
          onTrash={onTrash}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
