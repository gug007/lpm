import { LoaderCircle } from "lucide-react";
import { stripMarker } from "../../peer/markers";
import { copiesWord } from "../../projectArchive";
import type { ArchivedProject } from "../../projectArchive";
import { fullStamp, relativeAgo } from "../../relativeTime";
import { formatBytes } from "../../syncApi";
import { PORT_ACTION, PORT_DANGER } from "../ports/portsStyles";
import { StatusChip } from "../ui/StatusChip";
import { ARCHIVE_GRID } from "./archiveStyles";

interface ArchiveRowProps {
  project: ArchivedProject;
  // Absent while it's measured, null when it can't be.
  size: number | null | undefined;
  // The paired machine it's on, when the page lists more than one.
  machineName?: string;
  selected: boolean;
  onToggle: () => void;
  onUnarchive: () => void;
  onRemove: () => void;
}

function SizeCell({ size }: { size: number | null | undefined }) {
  if (size === undefined) {
    return (
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <LoaderCircle size={12} className="animate-spin" aria-hidden />
        <span className="sr-only">Measuring</span>
      </span>
    );
  }
  if (size === null) return <span className="text-[var(--text-muted)]">—</span>;
  return <span className="tabular-nums text-[var(--text-secondary)]">{formatBytes(size)}</span>;
}

export function ArchiveRow({
  project: p,
  size,
  machineName,
  selected,
  onToggle,
  onUnarchive,
  onRemove,
}: ArchiveRowProps) {
  const archivedSecs = Math.floor(p.archivedAt / 1000);
  const where = [
    stripMarker(p.root),
    machineName,
    p.copies > 0 ? `with ${copiesWord(p.copies)}` : "",
  ].filter(Boolean);

  return (
    <div
      className={`${ARCHIVE_GRID} border-t border-[var(--border)] px-4 py-2.5 text-[13px] first:border-t-0 ${
        selected ? "bg-[var(--bg-hover)]" : ""
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
        <button type="button" onClick={onUnarchive} className={PORT_ACTION}>
          Unarchive
        </button>
        <button type="button" onClick={onRemove} className={PORT_DANGER}>
          Remove…
        </button>
      </span>
    </div>
  );
}
