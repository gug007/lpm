import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { CheckIcon } from "../../icons";
import { PlayIcon } from "../icons";
import { displayNameForProjectName } from "../../ProjectNameDisplay";
import type { ProjectInfo } from "../../../types";

interface RunProjectsDialogProps {
  open: boolean;
  jobLabel: string;
  targets: string[];
  projects: ProjectInfo[];
  onCancel: () => void;
  onRun: (selected: string[]) => void;
}

// Shown when a job runs in more than one project and the user starts it by hand:
// pick which of its projects to run this time, all selected by default.
export function RunProjectsDialog({
  open,
  jobLabel,
  targets,
  projects,
  onCancel,
  onRun,
}: RunProjectsDialogProps) {
  const [selected, setSelected] = useState<string[]>(targets);
  useEffect(() => {
    if (open) setSelected(targets);
  }, [open, targets]);

  const toggle = (p: string) =>
    setSelected((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  const allOn = targets.length > 0 && selected.length === targets.length;
  const toggleAll = () => setSelected(allOn ? [] : targets);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex max-h-[min(560px,88vh)] flex-col">
        <header className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)]">
            <PlayIcon />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
              {jobLabel}
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">
              Choose which projects to run in.
            </p>
          </div>
        </header>

        <div className="flex items-center justify-between px-5 pb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Projects
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            {allOn ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
          {targets.map((p) => {
            const on = selected.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle(p)}
                className="group/row flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span
                  className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-colors [&_svg]:h-3 [&_svg]:w-3 ${
                    on
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)] text-[var(--bg-primary)]"
                      : "border-[var(--border)] text-transparent group-hover/row:border-[var(--text-muted)]"
                  }`}
                >
                  {on && <CheckIcon />}
                </span>
                <span
                  className={`min-w-0 truncate text-[13px] transition-colors ${
                    on
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {displayNameForProjectName(p, projects)}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
          <span className="text-[12px] text-[var(--text-muted)]">
            {selected.length} of {targets.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onRun(selected)}
              disabled={selected.length === 0}
              className="rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              {selected.length > 1 ? `Run in ${selected.length}` : "Run"}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}
