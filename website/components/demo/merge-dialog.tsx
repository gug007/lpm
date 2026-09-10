"use client";

import { useEffect, useMemo, useState } from "react";
import { BranchIcon, ChevronDownIcon, CloudBranchIcon } from "./branch-icons";
import type { DemoBranch } from "./projects";
import { RemoteBadge } from "./remote-badge";
import { SparkleGlyph } from "./sparkle-glyph";
import { FOCUS_RING, PRESS } from "./ui";
import {
  DialogFooter,
  DialogHeader,
  DialogPanel,
  PrimaryButton,
  SecondaryButton,
} from "./ui-kit";

export function MergeDialog({
  currentBranch,
  branches,
  onCancel,
  onMerge,
}: {
  currentBranch: string;
  branches: DemoBranch[];
  onCancel: () => void;
  onMerge: (branch: string) => void;
}) {
  const mergeable = useMemo(
    () =>
      branches.filter(
        (b) => (b.remote ? `${b.remote}/${b.name}` : b.name) !== currentBranch,
      ),
    [branches, currentBranch],
  );
  const [selected, setSelected] = useState<DemoBranch | undefined>(mergeable[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const labelOf = (b: DemoBranch) => (b.remote ? `${b.remote}/${b.name}` : b.name);

  // Escape closes the branch list first and the dialog second, and marks the key
  // handled so a menu still open behind the dialog doesn't act on the same press.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (pickerOpen) setPickerOpen(false);
      else onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickerOpen, onCancel]);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
      />
      <DialogPanel className="relative">
        <DialogHeader
          title="Merge"
          description={
            <>
              Merge another branch into{" "}
              <span className="font-mono text-[#e5e5e5]">{currentBranch}</span>.
            </>
          }
        />
        <div className="mt-4">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-[#919191]">
            Branch to merge
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={!selected}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              className={`flex w-full items-center gap-2.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-2 text-left text-[13px] text-[#e5e5e5] transition-colors hover:bg-[#2a2a2a] disabled:opacity-40 ${FOCUS_RING} ${PRESS}`}
            >
              {selected ? (
                <BranchOption b={selected} />
              ) : (
                <span className="flex-1 text-[#919191]">No other branches</span>
              )}
              <span className="shrink-0 text-[#919191]">
                <ChevronDownIcon />
              </span>
            </button>
            {pickerOpen && (
              <div className="menu-pop absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-2xl">
                {mergeable.map((b) => {
                  const active = selected && labelOf(b) === labelOf(selected);
                  return (
                    <button
                      key={labelOf(b)}
                      type="button"
                      onClick={() => {
                        setSelected(b);
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[#2a2a2a] ${
                        active ? "text-[#e5e5e5]" : "text-[#b3b3b3]"
                      }`}
                    >
                      <BranchOption b={b} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-2 text-[11px] text-[#919191]">
          <span className="text-[#c084fc]">
            <SparkleGlyph />
          </span>
          Conflicts? lpm can resolve them with AI.
        </div>
        <DialogFooter>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => selected && onMerge(labelOf(selected))}
            disabled={!selected}
          >
            Merge
          </PrimaryButton>
        </DialogFooter>
      </DialogPanel>
    </div>
  );
}

function BranchOption({ b }: { b: DemoBranch }) {
  return (
    <>
      <span className="shrink-0 text-[#919191]">
        {b.remote ? <CloudBranchIcon size={14} /> : <BranchIcon size={14} />}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">{b.name}</span>
      {b.remote && <RemoteBadge remote={b.remote} />}
      {b.age && (
        <span className="shrink-0 text-[11px] tabular-nums text-[#919191]">
          {b.age}
        </span>
      )}
    </>
  );
}
