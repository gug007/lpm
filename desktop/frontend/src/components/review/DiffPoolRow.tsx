import { memo } from "react";
import { useStore } from "zustand";
import { STATUS_DISPLAY, DEFAULT_STATUS } from "../ChangedFilesTree";
import { DirtyDot } from "../treeRow";
import { DiffConflictBanner } from "./DiffConflictBanner";
import { BinaryFilePlaceholder } from "./BinaryFilePlaceholder";
import { EMPTY_ROW, type DiffRowsStore } from "./diffPoolRows";
import { isPathEditable, type ReviewMode } from "./reviewSource";

export type ConflictResolution = "overwrite" | "theirs" | "dismiss";

interface DiffPoolRowProps {
  path: string;
  status: string;
  mode: ReviewMode;
  excluded: boolean;
  store: DiffRowsStore;
  frameRef: (el: HTMLDivElement | null) => void;
  bodyRef: (el: HTMLDivElement | null) => void;
  onSave: (path: string) => void;
  onResolve: (path: string, kind: ConflictResolution) => void;
}

// One changed-file row. It reads its own height/reveal/dirty state from the
// store, so an editor settling re-renders the file that changed and no other;
// the memo keeps the pool's own renders (a new file list) from touching rows
// whose props are unchanged.
function DiffPoolRowInner({
  path,
  status,
  mode,
  excluded,
  store,
  frameRef,
  bodyRef,
  onSave,
  onResolve,
}: DiffPoolRowProps) {
  const row = useStore(store, (s) => s.rows[path]) ?? EMPTY_ROW;
  const { dirty, revealed, binary, tooLarge, theirs, height: placeholderHeight } = row;
  const editable = isPathEditable(mode, status, binary || tooLarge);
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
        {dirty && <DirtyDot />}
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
