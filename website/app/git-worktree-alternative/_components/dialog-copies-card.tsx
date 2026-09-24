"use client";

import { useEffect, useRef } from "react";
import { Folder } from "lucide-react";
import DialogCopyRow from "./dialog-copy-row";
import DialogStepper from "./dialog-stepper";
import { copyLabel, type CopyDraft, type CopyRunMode } from "./dialog-data";
import { CARD, FIELD, HELPER_TEXT, SECTION_LABEL } from "./dialog-styles";

export default function DialogCopiesCard({
  copies,
  editing,
  onCountChange,
  onToggleEditing,
  onCopyModeChange,
}: {
  copies: CopyDraft[];
  editing: number | null;
  onCountChange: (next: number) => void;
  onToggleEditing: (serial: number) => void;
  onCopyModeChange: (serial: number, next: CopyRunMode) => void;
}) {
  const count = copies.length;
  const listRef = useRef<HTMLOListElement>(null);
  const prevCount = useRef(count);

  useEffect(() => {
    const list = listRef.current;
    if (list && count > prevCount.current) {
      list.scrollTo({ top: list.scrollHeight });
    }
    prevCount.current = count;
  }, [count]);

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className={SECTION_LABEL}>Copies</span>
        <DialogStepper count={count} onChange={onCountChange} />
      </div>

      <div className="border-t border-[var(--border)] px-4 py-3">
        {count === 1 ? (
          <>
            <div className="flex items-center gap-3">
              <span className={SECTION_LABEL}>Label</span>
              <span className={`${FIELD} h-9 min-w-0 flex-1 px-3`}>
                <span className="truncate">{copyLabel(copies[0].serial)}</span>
              </span>
            </div>
            <p className={`mt-2 ${HELPER_TEXT}`}>
              A label to recognize the copy by. Leave blank to name it
              automatically.
            </p>
          </>
        ) : (
          <>
            <span className={`${FIELD} h-9 gap-2.5 px-3`}>
              <Folder
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
              />
              <span className="truncate text-[var(--text-muted)]">
                Folder name (optional)
              </span>
            </span>
            <ol
              ref={listRef}
              aria-label="Copies"
              className="-mx-1 mt-2 max-h-[13.75rem] space-y-1.5 overflow-y-auto px-1 py-1"
            >
              {copies.map((copy, index) => (
                <DialogCopyRow
                  key={copy.serial}
                  index={index}
                  copy={copy}
                  expanded={editing === copy.serial}
                  onToggle={() => onToggleEditing(copy.serial)}
                  onModeChange={(next) => onCopyModeChange(copy.serial, next)}
                />
              ))}
            </ol>
            <p className={`mt-1 ${HELPER_TEXT}`}>
              Name a folder above to keep the copies together in the sidebar,
              or leave it blank. Use the menu beside a copy to run a different
              action or command on it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
