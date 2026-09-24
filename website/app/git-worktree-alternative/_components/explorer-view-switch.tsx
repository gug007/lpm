import type { Ref } from "react";
import { CopyPlus, GitBranch } from "lucide-react";

export type ExplorerView = "worktree" | "duplicate";

const VIEWS = [
  {
    view: "worktree",
    label: "git worktree add",
    icon: GitBranch,
    active:
      "bg-white text-blue-700 shadow-sm ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-300/25",
  },
  {
    view: "duplicate",
    label: "lpm Duplicate",
    icon: CopyPlus,
    active:
      "bg-white text-emerald-700 shadow-sm ring-emerald-600/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-300/25",
  },
] as const;

export default function ExplorerViewSwitch({
  view,
  onChange,
  controls,
  duplicateRef,
  className = "",
}: {
  view: ExplorerView;
  onChange: (view: ExplorerView) => void;
  controls: Record<ExplorerView, string>;
  duplicateRef?: Ref<HTMLButtonElement>;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Panel to show"
      className={`grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 ring-1 ring-inset ring-gray-200/70 dark:bg-white/[0.04] dark:ring-white/[0.06] ${className}`}
    >
      {VIEWS.map(({ view: value, label, icon: Icon, active }) => {
        const pressed = view === value;
        return (
          <button
            key={value}
            ref={value === "duplicate" ? duplicateRef : undefined}
            type="button"
            aria-pressed={pressed}
            aria-controls={controls[value]}
            onClick={() => onChange(value)}
            className={`inline-flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-2 text-[13px] font-semibold ring-1 ring-inset transition-colors motion-reduce:transition-none ${
              pressed
                ? active
                : "text-gray-500 ring-transparent hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
