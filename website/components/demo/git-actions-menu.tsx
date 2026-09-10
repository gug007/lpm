"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestArrow,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import { SparkleGlyph } from "./sparkle-glyph";
import { FOCUS_RING } from "./ui";

export type PullStrategy = "ff" | "ff-only" | "rebase";

export const PULL_STRATEGY_LABELS: Record<PullStrategy, string> = {
  ff: "Pull (ff if possible)",
  "ff-only": "Pull (ff-only)",
  rebase: "Pull (rebase)",
};

const PULL_STRATEGIES = Object.keys(PULL_STRATEGY_LABELS) as PullStrategy[];

const ROW = `flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
const INSET_ROW = `mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-40 ${FOCUS_RING}`;
const AI_ROW = `group flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
const ICON = "h-3.5 w-3.5 shrink-0";

type AutoAction = "commit" | "commit-push";

export function GitActionsMenu({
  busy,
  uncommitted,
  pullStrategy,
  onSelectPullStrategy,
  onCommit,
  onPull,
  onPush,
  onFetch,
  onCreatePR,
  onMerge,
  onDiscard,
  onAutoCommit,
  onAutoCommitAndPush,
}: {
  busy: boolean;
  uncommitted: number;
  pullStrategy: PullStrategy;
  onSelectPullStrategy: (strategy: PullStrategy) => void;
  onCommit: () => void;
  onPull: (strategy: PullStrategy) => void;
  onPush: () => void;
  onFetch: () => void;
  onCreatePR: () => void;
  onMerge: () => void;
  onDiscard: () => void;
  onAutoCommit: () => void;
  onAutoCommitAndPush: () => void;
}) {
  const [screen, setScreen] = useState<"root" | "pull">("root");
  const [generating, setGenerating] = useState<AutoAction | null>(null);
  const genTimer = useRef<number | null>(null);

  // Closing the menu unmounts it, so a pending run would otherwise commit for a
  // visitor who already dismissed the menu.
  useEffect(
    () => () => {
      if (genTimer.current) window.clearTimeout(genTimer.current);
    },
    [],
  );

  const runAuto = (action: AutoAction, run: () => void) => {
    if (genTimer.current) window.clearTimeout(genTimer.current);
    setGenerating(action);
    genTimer.current = window.setTimeout(() => {
      genTimer.current = null;
      setGenerating(null);
      run();
    }, 650);
  };

  return (
    <div className="menu-pop absolute bottom-full right-0 z-50 mb-2 w-80 overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] py-1.5 shadow-2xl">
      {screen === "root" ? (
        <>
          <button
            type="button"
            onClick={onCommit}
            disabled={busy || uncommitted === 0}
            className={ROW}
          >
            <GitCommitHorizontal className={ICON} strokeWidth={2} />
            Commit
          </button>
          <div className="mx-1.5 flex items-center overflow-hidden rounded-lg">
            <button
              type="button"
              onClick={() => onPull(pullStrategy)}
              disabled={busy}
              className={`flex flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-[13px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Download className={ICON} strokeWidth={2} />
              {PULL_STRATEGY_LABELS[pullStrategy]}
            </button>
            <button
              type="button"
              onClick={() => setScreen("pull")}
              disabled={busy}
              title="Configure"
              aria-label="Configure pull"
              className={`flex items-center border-l border-[#2e2e2e] px-2.5 py-2 text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-40 ${FOCUS_RING}`}
            >
              <ChevronRight className={ICON} strokeWidth={2} />
            </button>
          </div>
          <button type="button" onClick={onPush} disabled={busy} className={ROW}>
            <Upload className={ICON} strokeWidth={2} />
            Push
          </button>
          <button type="button" onClick={onFetch} disabled={busy} className={ROW}>
            <RefreshCw className={ICON} strokeWidth={2} />
            Fetch
          </button>
          <button type="button" onClick={onCreatePR} className={ROW}>
            <GitPullRequestArrow className={ICON} strokeWidth={2} />
            Create PR
          </button>
          <button type="button" onClick={onMerge} disabled={busy} className={ROW}>
            <GitMerge className={ICON} strokeWidth={2} />
            Merge
          </button>
          <div className="my-1.5 border-t border-[#2e2e2e]" />
          <AutoCommitRow
            label="Auto Commit"
            description="AI writes the message, then commits"
            generating={generating === "commit"}
            disabled={busy || uncommitted === 0 || generating !== null}
            onClick={() => runAuto("commit", onAutoCommit)}
          />
          <AutoCommitRow
            label="Auto Commit and Push"
            description="AI writes the message, commits, and pushes"
            generating={generating === "commit-push"}
            disabled={busy || uncommitted === 0 || generating !== null}
            onClick={() => runAuto("commit-push", onAutoCommitAndPush)}
          />
          <div className="my-1.5 border-t border-[#2e2e2e]" />
          <button
            type="button"
            onClick={onDiscard}
            disabled={uncommitted === 0}
            className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[#f87171] transition-colors hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            <RotateCcw className={ICON} strokeWidth={2} />
            Discard all changes
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setScreen("root")}
            className={`mx-2 mb-1 flex items-center gap-1 rounded-lg py-1 pl-1 pr-2.5 text-left transition-colors hover:bg-[#2a2a2a] ${FOCUS_RING}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#b3b3b3]">
              <ChevronLeft className={ICON} strokeWidth={2} />
            </span>
            <span className="min-w-0 truncate text-[12.5px] font-medium text-[#e5e5e5]">
              Pull
            </span>
          </button>
          <div className="px-4 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[#919191]">
            Default on click
          </div>
          {PULL_STRATEGIES.map((strategy) => {
            const active = strategy === pullStrategy;
            return (
              <button
                key={strategy}
                type="button"
                onClick={() => onSelectPullStrategy(strategy)}
                disabled={busy}
                className={INSET_ROW}
              >
                <span className="flex w-3.5 shrink-0">
                  {active && <Check className={ICON} strokeWidth={2.5} />}
                </span>
                <span className={active ? "text-[#e5e5e5]" : ""}>
                  {PULL_STRATEGY_LABELS[strategy]}
                </span>
              </button>
            );
          })}
          <div className="mx-3 my-1 border-t border-[#2e2e2e]" />
          <button
            type="button"
            onClick={() => onPull(pullStrategy)}
            disabled={busy}
            className={`mx-1.5 mt-1 flex w-[calc(100%-12px)] items-center justify-center rounded-lg px-2.5 py-2 text-[13px] font-medium text-[#4ade80] transition-colors hover:bg-[#2a2a2a] disabled:opacity-40 ${FOCUS_RING}`}
          >
            Run pull
          </button>
        </>
      )}
    </div>
  );
}

function AutoCommitRow({
  label,
  description,
  generating,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  generating: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={AI_ROW}>
      <span
        className={`mt-0.5 text-[#b3b3b3] ${generating ? "animate-spin" : ""}`}
      >
        <SparkleGlyph size={14} />
      </span>
      <span className="flex flex-col">
        <span className="text-[13px] text-[#b3b3b3] group-hover:text-[#e5e5e5]">
          {generating ? "Generating…" : label}
        </span>
        <span className="text-[11px] text-[#919191]">{description}</span>
      </span>
    </button>
  );
}
