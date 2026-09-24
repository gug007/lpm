"use client";

import { useState } from "react";
import DialogCopiesCard from "./dialog-copies-card";
import DialogHeader from "./dialog-header";
import DialogOptionsCard from "./dialog-options-card";
import DialogRunCard from "./dialog-run-card";
import DialogToast from "./dialog-toast";
import { useToastSequence } from "./dialog-toast-sequence";
import {
  DEFAULT_OPTIONS,
  INITIAL_COPIES,
  MAX_COPIES,
  MIN_COPIES,
  confirmLabel,
  type CopyDraft,
  type CopyRunMode,
  type DuplicateOptions,
  type OptionKey,
  type RunMode,
} from "./dialog-data";

const INITIAL_DRAFTS: CopyDraft[] = Array.from(
  { length: INITIAL_COPIES },
  (_, serial) => ({ serial, override: null }),
);

export default function DialogReplica() {
  const [copies, setCopies] = useState<CopyDraft[]>(INITIAL_DRAFTS);
  const [nextSerial, setNextSerial] = useState(INITIAL_COPIES);
  const [editing, setEditing] = useState<number | null>(null);
  const [mode, setMode] = useState<RunMode>("action");
  const [runOpen, setRunOpen] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [options, setOptions] = useState<DuplicateOptions>(DEFAULT_OPTIONS);
  const { toast, play } = useToastSequence();

  const count = copies.length;

  // A lone copy has no per-copy menu, so an override left from a higher count
  // is dropped rather than silently applied.
  const changeCount = (next: number) => {
    const n = Math.min(MAX_COPIES, Math.max(MIN_COPIES, next));
    if (n === count) return;
    let drafts: CopyDraft[];
    if (n < count) {
      drafts = copies.slice(0, n);
      if (n === 1) drafts = [{ ...drafts[0], override: null }];
    } else {
      const added = Array.from({ length: n - count }, (_, i) => ({
        serial: nextSerial + i,
        override: null,
      }));
      drafts = [...copies, ...added];
      setNextSerial(nextSerial + added.length);
    }
    setCopies(drafts);
    if (
      editing !== null &&
      (n === 1 || !drafts.some((c) => c.serial === editing))
    ) {
      setEditing(null);
    }
  };

  const setCopyMode = (serial: number, next: CopyRunMode) =>
    setCopies((prev) =>
      prev.map((c) =>
        c.serial === serial
          ? { ...c, override: next === "default" ? null : next }
          : c,
      ),
    );

  const setOption = (key: OptionKey, value: boolean) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      data-on-dark
      className="replica-ui relative mx-auto w-full max-w-[560px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] text-left text-[var(--text-primary)] shadow-2xl shadow-gray-300/70 dark:shadow-black/60"
    >
      <DialogHeader />

      <div className="space-y-3 px-4 pb-5 pt-5 sm:px-6 sm:pb-6">
        <DialogCopiesCard
          copies={copies}
          editing={editing}
          onCountChange={changeCount}
          onToggleEditing={(serial) =>
            setEditing((e) => (e === serial ? null : serial))
          }
          onCopyModeChange={setCopyMode}
        />
        <DialogRunCard
          count={count}
          mode={mode}
          onModeChange={setMode}
          open={runOpen}
          onToggle={() => setRunOpen((o) => !o)}
        />
        <DialogOptionsCard
          count={count}
          options={options}
          onOptionChange={setOption}
          open={optionsOpen}
          onToggle={() => setOptionsOpen((o) => !o)}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
        <span
          aria-hidden
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)]"
        >
          Cancel
        </span>
        <button
          type="button"
          onClick={() => play(count)}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90"
        >
          {confirmLabel(count, mode !== "none")}
        </button>
      </div>

      <DialogToast toast={toast} />
    </div>
  );
}
