import { folderKinds, freeableBytes, type CopySpaceInfo } from "../diskSpace";
import { formatBytes } from "../syncApi";

// More kinds than this are counted, so the line stays short.
const KINDS_NAMED = 3;

function kindsText(space: CopySpaceInfo): string {
  const kinds = folderKinds([space]);
  const shown = kinds.slice(0, KINDS_NAMED).join(", ");
  return kinds.length > KINDS_NAMED ? `${shown} +${kinds.length - KINDS_NAMED}` : shown;
}

/** One copy in the Free space panel: its own disk use, with the part that can
 *  go drawn inside it. */
export function CopySpaceRow({
  label,
  worktree,
  space,
  state,
  scale,
}: {
  label: string;
  worktree: boolean;
  // Absent while measuring, null when it can't be measured.
  space: CopySpaceInfo | null | undefined;
  // Why it's left alone, if it is.
  state: "running" | "agent" | null;
  // The biggest copy's bytes, so the bars compare.
  scale: number;
}) {
  const freeable = freeableBytes(space);
  const width = (bytes: number) => `${scale > 0 ? Math.max(1, (bytes / scale) * 100) : 0}%`;
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-2 text-[13px]">
        <span className="truncate font-medium text-[var(--text-primary)]">{label}</span>
        {worktree && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">worktree</span>}
        {state === "running" && (
          <span className="shrink-0 text-[11px] text-[var(--accent-green-text)]">Running</span>
        )}
        {state === "agent" && (
          <span className="shrink-0 text-[11px] text-[var(--accent-amber-text)]">Agent at work</span>
        )}
        <span className="ml-auto shrink-0 tabular-nums text-[var(--text-secondary)]">
          {space === undefined ? "Measuring…" : space === null ? "—" : formatBytes(space.bytes)}
        </span>
      </div>
      {space && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-active)]">
            <div className="flex h-full" style={{ width: width(space.bytes) }}>
              <span className="h-full bg-[var(--text-muted)] opacity-40" style={{ flex: Math.max(space.bytes - freeable, 0) }} />
              <span className="h-full bg-[var(--text-secondary)]" style={{ flex: freeable }} />
            </div>
          </div>
          <p className="text-[11.5px] text-[var(--text-muted)]">
            {freeable > 0 ? `${formatBytes(freeable)} can go · ${kindsText(space)}` : "Nothing to free"}
          </p>
        </>
      )}
    </li>
  );
}
