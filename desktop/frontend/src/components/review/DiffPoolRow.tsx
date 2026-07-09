import { memo } from "react";
import { STATUS_DISPLAY, DEFAULT_STATUS } from "../ChangedFilesTree";
import { DiffConflictBanner } from "./DiffConflictBanner";
import { BinaryFilePlaceholder } from "./BinaryFilePlaceholder";

export type ConflictResolution = "overwrite" | "theirs" | "dismiss";

interface DiffPoolRowProps {
  path: string;
  status: string;
  dirty: boolean;
  editable: boolean;
  binary: boolean;
  tooLarge: boolean;
  revealed: boolean;
  excluded: boolean;
  theirs: string | undefined;
  placeholderHeight: number;
  frameRef: (el: HTMLDivElement | null) => void;
  bodyRef: (el: HTMLDivElement | null) => void;
  onSave: (path: string) => void;
  onResolve: (path: string, kind: ConflictResolution) => void;
}

// One changed-file row. Memoized so a single editor settling — which bumps
// pool-level height/reveal/dirty state — re-renders only the file that changed,
// not all N rows. Every prop is a primitive or a per-path-stable callback, so
// React.memo's shallow compare skips untouched rows.
function DiffPoolRowInner({
  path,
  status,
  dirty,
  editable,
  binary,
  tooLarge,
  revealed,
  excluded,
  theirs,
  placeholderHeight,
  frameRef,
  bodyRef,
  onSave,
  onResolve,
}: DiffPoolRowProps) {
  const { dot } = STATUS_DISPLAY[status] ?? DEFAULT_STATUS;
  return (
    <div
      data-path={path}
      ref={frameRef}
      className={`border-b border-[var(--border)] last:border-b-0 ${
        excluded ? "opacity-60" : ""
      }`}
    >
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
          title={status}
          aria-label={status}
        />
        <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
          {path}
        </span>
        {excluded && (
          <span className="shrink-0 text-[10px] font-normal text-[var(--text-muted)]">
            (excluded)
          </span>
        )}
        {dirty && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]"
            title="Unsaved changes"
          />
        )}
        <span className="flex-1" />
        {editable && dirty && (
          <button
            onClick={() => onSave(path)}
            className="shrink-0 rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-[10px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
          >
            Save
          </button>
        )}
      </div>
      {theirs !== undefined && (
        <DiffConflictBanner
          path={path}
          onOverwrite={() => onResolve(path, "overwrite")}
          onUseTheirs={() => onResolve(path, "theirs")}
          onDismiss={() => onResolve(path, "dismiss")}
        />
      )}
      {binary || tooLarge ? (
        <div className="py-6">
          <BinaryFilePlaceholder
            path={path}
            message={tooLarge ? "File too large to diff" : undefined}
          />
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="relative w-full"
          style={{ minHeight: revealed ? undefined : placeholderHeight }}
        />
      )}
    </div>
  );
}

export const DiffPoolRow = memo(DiffPoolRowInner);
