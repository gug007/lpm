import type { CSSProperties, ReactNode } from "react";
import {
  CircleCheck,
  CopyPlus,
  FolderOpen,
  GitBranch,
  ListTodo,
} from "lucide-react";
import FolderRow from "./folder-row";
import MiniTerminal from "./explorer-mini-terminal";
import type { ExplorerRow, ItemCell } from "./explorer-data";
import { TERMINAL_TITLE, type TermLine } from "./explorer-terminal-data";

type Tone = "worktree" | "duplicate";

const FIXED_TRACKS = 4;

const TONE = {
  worktree: {
    icon: GitBranch,
    card: "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]",
    rule: "border-gray-100 dark:border-gray-800",
    tile: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
    folder: "text-blue-600 dark:text-blue-300",
    pill: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-300/20",
    flash: "bg-blue-400/15",
    prompt: "text-[#79b8ff]",
    summaryIcon: ListTodo,
    summary:
      "bg-amber-50/80 text-amber-950 ring-amber-200/80 dark:bg-amber-400/[0.06] dark:text-amber-100 dark:ring-amber-300/15",
    summaryIconTint: "text-amber-600 dark:text-amber-300",
  },
  duplicate: {
    icon: CopyPlus,
    card: "border-emerald-200 bg-emerald-50/35 dark:border-emerald-900/60 dark:bg-emerald-400/[0.045]",
    rule: "border-emerald-100 dark:border-emerald-900/50",
    tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    folder: "text-emerald-600 dark:text-emerald-300",
    pill: "bg-emerald-100/80 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-300/20",
    flash: "bg-emerald-400/20 dark:bg-emerald-300/15",
    prompt: "text-[#7ee2b8]",
    summaryIcon: CircleCheck,
    summary:
      "bg-emerald-100/60 text-emerald-950 ring-emerald-300/50 dark:bg-emerald-400/[0.08] dark:text-emerald-50 dark:ring-emerald-300/15",
    summaryIconTint: "text-emerald-600 dark:text-emerald-300",
  },
} as const;

export type PanelRow = { row: ExplorerRow; cell: ItemCell; flash?: number };

export default function FolderPanel({
  id,
  tone,
  eyebrow,
  title,
  how,
  folder,
  folderTag,
  rows,
  summary,
  terminalId,
  terminal,
  showTerminal,
  footer,
  animateChanges = false,
  className = "",
}: {
  id: string;
  tone: Tone;
  eyebrow: string;
  title: string;
  how: ReactNode;
  folder: string;
  folderTag: string;
  rows: PanelRow[];
  summary: { title: string; detail: string };
  terminalId: string;
  terminal: TermLine[];
  showTerminal: boolean;
  footer?: ReactNode;
  animateChanges?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = t.icon;
  const SummaryIcon = t.summaryIcon;
  return (
    <div
      id={id}
      style={{ "--panel-rows": rows.length + FIXED_TRACKS } as CSSProperties}
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border shadow-sm md:row-[2/span_var(--panel-rows)] md:grid md:grid-rows-subgrid ${t.card} ${className}`}
    >
      <div className={`border-b px-4 pb-3 pt-3.5 sm:px-5 ${t.rule}`}>
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.tile}`}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              {eyebrow}
            </p>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          </div>
        </div>
        <div className="mt-3">{how}</div>
      </div>

      <div className="flex min-w-0 items-center gap-2 px-4 pb-1 pt-3.5 sm:px-5">
        <FolderOpen className={`h-4 w-4 shrink-0 ${t.folder}`} aria-hidden />
        <code className="truncate font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
          {folder}
        </code>
        <span
          className={`shrink-0 rounded-full px-2 py-px text-[10.5px] font-medium leading-4 ring-1 ring-inset ${t.pill}`}
        >
          {folderTag}
        </span>
      </div>

      <ul
        aria-label={`Inside ${folder}`}
        style={{ "--item-rows": rows.length } as CSSProperties}
        className="ml-6 flex min-w-0 flex-col sm:ml-7 md:row-span-(--item-rows) md:grid md:grid-rows-subgrid"
      >
        {rows.map(({ row, cell, flash }) => (
          <FolderRow
            key={row.id}
            name={row.name}
            kind={row.kind}
            tag={row.tag}
            cell={cell}
            flash={flash}
            flashTint={t.flash}
          />
        ))}
      </ul>

      <div className="flex flex-col px-4 pb-3 pt-2.5 sm:px-5">
        <div className={`flex flex-1 gap-2.5 rounded-xl px-3.5 py-3 ring-1 ring-inset ${t.summary}`}>
          <SummaryIcon className={`mt-0.5 h-4 w-4 shrink-0 ${t.summaryIconTint}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{summary.title}</p>
            <p
              key={summary.detail}
              className={`mt-0.5 text-xs leading-relaxed opacity-80${
                animateChanges
                  ? " transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none"
                  : ""
              }`}
            >
              {summary.detail}
            </p>
          </div>
        </div>
      </div>

      <div
        id={terminalId}
        className={`${showTerminal ? "flex" : "hidden"} min-w-0 flex-col px-3 pb-3 sm:px-4 sm:pb-4 motion-safe:transition-[opacity,translate] motion-safe:duration-500 motion-safe:ease-out motion-safe:starting:-translate-y-2 motion-safe:starting:opacity-0`}
      >
        <MiniTerminal title={TERMINAL_TITLE} lines={terminal} accent={t.prompt} />
      </div>

      {footer && <div className="md:hidden">{footer}</div>}
    </div>
  );
}
