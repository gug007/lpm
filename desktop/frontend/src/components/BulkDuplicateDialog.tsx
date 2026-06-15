import { useEffect, useState, type ReactNode } from "react";
import { useEventListener } from "../hooks/useEventListener";
import { Modal } from "./ui/Modal";
import { ActionPicker } from "./ActionPicker";
import type { ProjectInfo, SpawnTask } from "../types";

const MIN_COUNT = 1;

type RunMode = "none" | "action" | "command";

export interface BulkDuplicateOptions {
  excludeUncommitted: boolean;
  reinstallDeps: boolean;
  tasks: SpawnTask[];
}

interface BulkDuplicateDialogProps {
  open: boolean;
  project: ProjectInfo | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (count: number, opts: BulkDuplicateOptions) => void;
}

export function BulkDuplicateDialog({
  open,
  project,
  busy,
  onCancel,
  onConfirm,
}: BulkDuplicateDialogProps) {
  const [count, setCount] = useState(1);
  const [mode, setMode] = useState<RunMode>("none");
  const [actionName, setActionName] = useState("");
  const [command, setCommand] = useState("");
  const [excludeUncommitted, setExcludeUncommitted] = useState(false);
  const [reinstallDeps, setReinstallDeps] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCount(1);
    setMode("none");
    setActionName("");
    setCommand("");
    setExcludeUncommitted(false);
    setReinstallDeps(false);
  }, [open, project?.name]);

  // Only offer actions that run unattended on every copy: leaf actions (no
  // children) that don't pause for per-run input or confirmation.
  const runnableActions = (project?.actions ?? []).filter(
    (a) => !a.children?.length && !a.inputs?.length && !a.confirm,
  );

  const clamp = (n: number) => Math.max(MIN_COUNT, n);
  const noun = count === 1 ? "copy" : "copies";

  const pickMode = (next: RunMode) => {
    setMode(next);
    if (next === "action" && !actionName && runnableActions.length > 0) {
      setActionName(runnableActions[0].name);
    }
  };

  const buildTasks = (): SpawnTask[] => {
    if (mode === "action" && actionName) return [{ kind: "action", actionName }];
    if (mode === "command" && command.trim())
      return [{ kind: "command", command: command.trim() }];
    return [];
  };

  const handleConfirm = () => {
    if (busy || !project) return;
    onConfirm(count, {
      excludeUncommitted,
      reinstallDeps,
      tasks: buildTasks(),
    });
  };

  // Enter confirms from the count or command field; leave it to the focused
  // control when a button (segment, picker option, toggle) has focus.
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      if (document.activeElement instanceof HTMLButtonElement) return;
      e.preventDefault();
      handleConfirm();
    },
    document,
    open,
  );

  const segments: { key: RunMode; label: string; disabled?: boolean }[] = [
    { key: "none", label: "Nothing" },
    { key: "action", label: "Action", disabled: runnableActions.length === 0 },
    { key: "command", label: "Command" },
  ];

  const renderToggle = (
    checked: boolean,
    onChange: (v: boolean) => void,
    title: string,
    description: string,
  ): ReactNode => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        checked
          ? "border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/5"
          : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)] text-[var(--bg-primary)]"
            : "border-[var(--border)]"
        }`}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">{description}</span>
      </span>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName="w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-[var(--accent-cyan)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Duplicate</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-secondary)]">
            Create one or more copies of{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {project?.label || project?.name}
            </span>
            , each ready to work in on its own.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          How many copies
        </p>
        <div className="inline-flex items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          <button
            onClick={() => setCount((c) => clamp(c - 1))}
            disabled={count <= MIN_COUNT}
            className="flex h-9 w-9 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
            aria-label="Fewer copies"
          >
            −
          </button>
          <input
            value={count}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              if (!Number.isNaN(n)) setCount(clamp(n));
            }}
            inputMode="numeric"
            className="h-9 w-11 border-x border-[var(--border)] bg-transparent text-center text-sm font-semibold text-[var(--text-primary)] outline-none"
          />
          <button
            onClick={() => setCount((c) => clamp(c + 1))}
            className="flex h-9 w-9 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label="More copies"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Run on each copy
        </p>
        <div className="mt-2 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => pickMode(s.key)}
              disabled={s.disabled}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === s.key
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:text-[var(--text-secondary)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {mode === "action" && (
          <ActionPicker
            actions={runnableActions}
            value={actionName}
            onChange={setActionName}
          />
        )}

        {mode === "command" && (
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Enter a command…"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 font-mono text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
          />
        )}

        {mode !== "none" && (
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {mode === "command"
              ? "Runs in a terminal on each copy as soon as it's created."
              : "Starts on each copy in the background as soon as it's created."}
          </p>
        )}
      </div>

      <div className="mt-5 space-y-2">
        {renderToggle(
          excludeUncommitted,
          setExcludeUncommitted,
          "Fresh checkout",
          "Reset each copy to the last commit, dropping uncommitted changes.",
        )}
        {renderToggle(
          reinstallDeps,
          setReinstallDeps,
          "Reinstall dependencies",
          "Copy without dependencies, then install them fresh in each copy.",
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={busy || !project}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
        >
          Create {count} {noun}
        </button>
      </div>
    </Modal>
  );
}
