"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import ExplorerOptions from "./explorer-options";
import ExplorerViewSwitch, { type ExplorerView } from "./explorer-view-switch";
import FolderPanel, { type PanelRow } from "./folder-panel";
import TerminalToggle from "./explorer-terminal-toggle";
import {
  DEFAULT_OPTIONS,
  DUPLICATE_FOLDER,
  EXPLORER_ROWS,
  RESET_ANNOUNCEMENT,
  WORKTREE_COMMAND,
  WORKTREE_FOLDER,
  WORKTREE_SUMMARY,
  announce,
  duplicateSummary,
  type DuplicateOptions,
  type ItemCell,
  type OptionKey,
} from "./explorer-data";
import { WORKTREE_TERMINAL, duplicateTerminal } from "./explorer-terminal-data";

type Change = { version: number; before: DuplicateOptions };

const WORKTREE_ROWS: PanelRow[] = EXPLORER_ROWS.map((row) => ({
  row,
  cell: row.worktree,
}));

const sameCell = (a: ItemCell, b: ItemCell) =>
  a.state === b.state && a.reason === b.reason && a.name === b.name;

const CHIP =
  "inline-flex items-center rounded-md bg-white px-1.5 py-0.5 font-medium text-gray-800 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.06] dark:text-gray-200 dark:ring-white/10";

const hideOnPhoneUnless = (visible: boolean) => (visible ? "" : "max-md:hidden");

export default function FolderExplorer() {
  const [options, setOptions] = useState<DuplicateOptions>(DEFAULT_OPTIONS);
  const [change, setChange] = useState<Change | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [view, setView] = useState<ExplorerView>("worktree");
  const [showTerminal, setShowTerminal] = useState(false);
  const duplicateTab = useRef<HTMLButtonElement>(null);

  const uid = useId();
  const ids = {
    worktree: `${uid}-worktree`,
    duplicate: `${uid}-duplicate`,
    worktreeTerminal: `${uid}-worktree-terminal`,
    duplicateTerminal: `${uid}-duplicate-terminal`,
  };

  const showDuplicate = () => {
    setView("duplicate");
    duplicateTab.current?.scrollIntoView({ block: "start" });
    duplicateTab.current?.focus({ preventScroll: true });
  };

  const apply = (next: DuplicateOptions, message: string) => {
    setChange({ version: (change?.version ?? 0) + 1, before: options });
    setOptions(next);
    setAnnouncement(message);
  };

  const toggle = (key: OptionKey) => {
    const next = { ...options, [key]: !options[key] };
    apply(next, announce(key, next[key]));
  };

  const duplicateRows: PanelRow[] = EXPLORER_ROWS.map((row) => {
    const cell = row.duplicate(options);
    const moved = change && !sameCell(row.duplicate(change.before), cell);
    return { row, cell, flash: moved ? change.version : undefined };
  });

  return (
    <div className="grid grid-cols-1 gap-y-3 md:grid-cols-2 md:gap-x-5 md:gap-y-0">
      <ExplorerViewSwitch
        view={view}
        onChange={setView}
        controls={{ worktree: ids.worktree, duplicate: ids.duplicate }}
        duplicateRef={duplicateTab}
        className="md:hidden"
      />

      <FolderPanel
        id={ids.worktree}
        tone="worktree"
        eyebrow="Built into Git"
        title="git worktree add"
        how={
          <code className="inline-block max-w-full rounded-md bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-800 [overflow-wrap:anywhere] sm:text-xs md:text-[11px] lg:text-xs dark:bg-white/[0.06] dark:text-gray-200">
            <span className="select-none text-gray-400 dark:text-gray-500">$ </span>
            {WORKTREE_COMMAND}
          </code>
        }
        folder={WORKTREE_FOLDER}
        folderTag="linked worktree"
        rows={WORKTREE_ROWS}
        summary={WORKTREE_SUMMARY}
        terminalId={ids.worktreeTerminal}
        terminal={WORKTREE_TERMINAL}
        showTerminal={showTerminal}
        footer={
          <button
            type="button"
            onClick={showDuplicate}
            className="group flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-b-2xl border-t border-gray-100 px-4 py-3 -outline-offset-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50/60 motion-reduce:transition-none dark:border-gray-800 dark:text-emerald-300 dark:hover:bg-emerald-400/[0.06]"
          >
            Now see lpm Duplicate
            <ArrowRight
              className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
        }
        className={`md:col-start-1 ${hideOnPhoneUnless(view === "worktree")}`}
      />

      <ExplorerOptions
        options={options}
        announcement={announcement}
        onToggle={toggle}
        onReset={() => apply(DEFAULT_OPTIONS, RESET_ANNOUNCEMENT)}
        className={`md:col-span-2 md:row-start-1 md:mb-4 ${hideOnPhoneUnless(view === "duplicate")}`}
      />

      <FolderPanel
        id={ids.duplicate}
        tone="duplicate"
        eyebrow="In lpm"
        title="lpm Duplicate"
        how={
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
            Right-click <span className={CHIP}>shop</span>
            <span aria-hidden>›</span>
            <span className="sr-only">, choose </span>
            <span className={CHIP}>Duplicate</span>
            <span aria-hidden>›</span>
            <span className="sr-only">, then </span>
            <span className={CHIP}>Create 1 copy</span>
          </p>
        }
        folder={DUPLICATE_FOLDER}
        folderTag="standalone copy"
        rows={duplicateRows}
        summary={duplicateSummary(options)}
        terminalId={ids.duplicateTerminal}
        terminal={duplicateTerminal(options)}
        showTerminal={showTerminal}
        animateChanges={change !== null}
        className={`md:col-start-2 ${hideOnPhoneUnless(view === "duplicate")}`}
      />

      <TerminalToggle
        expanded={showTerminal}
        controls={`${ids.worktreeTerminal} ${ids.duplicateTerminal}`}
        onToggle={() => setShowTerminal((shown) => !shown)}
        className="mt-1 justify-self-center md:col-span-2 md:mt-4"
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
