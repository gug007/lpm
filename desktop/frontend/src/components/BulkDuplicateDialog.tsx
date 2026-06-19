import { useEffect, useState, type ReactNode } from "react";
import { Folder, GitBranch, Package } from "lucide-react";
import { useEventListener } from "../hooks/useEventListener";
import { Modal } from "./ui/Modal";
import { ActionPicker } from "./ActionPicker";
import { PromptComposer, type PromptImage } from "./PromptComposer";
import { getSettings, saveSettings } from "../store/settings";
import { shellQuote } from "../terminal-io";
import type { ProjectInfo, SpawnTask } from "../types";

const MIN_COUNT = 1;
const MAX_COUNT = 50;

// Mirror the backend's id alphabet so the default label matches the name a
// copy would otherwise be given.
const NAME_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomId6(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += NAME_ALPHABET[bytes[i] % NAME_ALPHABET.length];
  }
  return out;
}

const FIELD_CLASS =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]";

type RunMode = "none" | "action" | "command";

export interface BulkDuplicateOptions {
  excludeUncommitted: boolean;
  reinstallDeps: boolean;
  labels: string[];
  tasks: SpawnTask[];
  groupName: string;
}

interface BulkDuplicateDialogProps {
  open: boolean;
  project: ProjectInfo | null;
  folderNames: string[];
  onCancel: () => void;
  onConfirm: (count: number, opts: BulkDuplicateOptions) => void;
}

export function BulkDuplicateDialog({
  open,
  project,
  folderNames,
  onCancel,
  onConfirm,
}: BulkDuplicateDialogProps) {
  const [labels, setLabels] = useState<string[]>([""]);
  const count = labels.length;
  const [mode, setMode] = useState<RunMode>("none");
  const [actionName, setActionName] = useState("");
  const [command, setCommand] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptImages, setPromptImages] = useState<PromptImage[]>([]);
  const [excludeUncommitted, setExcludeUncommitted] = useState(false);
  const [reinstallDeps, setReinstallDeps] = useState(false);
  const [groupName, setGroupName] = useState("");

  // Default each label to the copy's would-be name (`<original>-<id>`), the
  // same scheme the backend uses for the folder, so the field shows the copy's
  // name rather than the original's.
  const base = project?.parentName || project?.name;
  const genLabel = () => (base ? `${base}-${randomId6()}` : "");

  useEffect(() => {
    if (!open) return;
    setLabels([genLabel()]);
    setMode("none");
    setActionName("");
    setCommand("");
    setPrompt("");
    setPromptImages([]);
    setExcludeUncommitted(getSettings().duplicateExcludeUncommitted ?? false);
    setReinstallDeps(getSettings().duplicateReinstallDeps ?? false);
    setGroupName("");
  }, [open, project?.name]);

  // Only offer actions that run unattended on every copy: leaf actions (no
  // children) that don't pause for per-run input or confirmation.
  const runnableActions = (project?.actions ?? []).filter(
    (a) => !a.children?.length && !a.inputs?.length && !a.confirm,
  );

  const clamp = (n: number) => Math.min(MAX_COUNT, Math.max(MIN_COUNT, n));

  // Keep one label field per copy: grow with fresh default labels, shrink by
  // trimming, and preserve labels the user already typed.
  const changeCount = (next: number) => {
    const n = clamp(next);
    setLabels((prev) => {
      if (n <= prev.length) return prev.slice(0, n);
      const out = prev.slice();
      while (out.length < n) out.push(genLabel());
      return out;
    });
  };

  const setLabelAt = (i: number, value: string) =>
    setLabels((prev) => {
      const next = prev.slice();
      next[i] = value;
      return next;
    });

  const single = count === 1;
  const noun = single ? "copy" : "copies";
  const copyRef = single ? "the copy" : "each copy";
  const folderOptions = Array.from(
    new Set(folderNames.map((n) => n.trim()).filter(Boolean)),
  );
  const trimmedGroup = groupName.trim();
  const hasGroup = !single && trimmedGroup.length > 0;
  const railColor = hasGroup ? "bg-[var(--accent-cyan)]/45" : "bg-[var(--border)]";
  const imagesPending = promptImages.some((im) => !im.path && !im.error);

  const pickMode = (next: RunMode) => {
    setMode(next);
    if (next === "none") {
      setPromptImages((prev) => {
        prev.forEach((im) => URL.revokeObjectURL(im.url));
        return [];
      });
    }
    if (next === "action" && !actionName && runnableActions.length > 0) {
      setActionName(runnableActions[0].name);
    }
  };

  const buildTasks = (): SpawnTask[] => {
    // The seed is typed into the terminal as one line then submitted, so flatten
    // newlines and append the saved image paths for the agent to pick up.
    const text = prompt.replace(/\s*\n\s*/g, " ").trim();
    const paths = promptImages.map((im) => im.path).filter(Boolean).map(shellQuote);
    const seed = [text, ...paths].filter(Boolean).join(" ") || undefined;
    if (mode === "action" && actionName)
      return [{ kind: "action", actionName, prompt: seed }];
    if (mode === "command" && command.trim())
      return [{ kind: "command", command: command.trim(), prompt: seed }];
    return [];
  };

  const handleConfirm = () => {
    if (!project) return;
    saveSettings({
      duplicateExcludeUncommitted: excludeUncommitted,
      duplicateReinstallDeps: reinstallDeps,
    });
    onConfirm(count, {
      excludeUncommitted,
      reinstallDeps,
      labels: labels.map((l) => l.trim()),
      tasks: buildTasks(),
      groupName: single ? "" : trimmedGroup,
    });
  };

  // Enter confirms from the count or command field; leave it to the focused
  // control when a button (segment, picker option, toggle) has focus, and let
  // Shift+Enter add a newline while composing the prompt.
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      if (document.activeElement instanceof HTMLButtonElement) return;
      if (e.shiftKey && document.activeElement instanceof HTMLTextAreaElement)
        return;
      e.preventDefault();
      if (imagesPending) return;
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
    icon: ReactNode,
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
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          checked
            ? "bg-[var(--accent-cyan)] text-[var(--bg-primary)]"
            : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
        }`}
      >
        {icon}
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
      contentClassName="max-h-[85vh] w-[min(560px,92vw)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
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
            Create {single ? "a copy" : `${count} copies`} of{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {project?.label || project?.name}
            </span>
            {single
              ? ", ready to work in on its own."
              : ", each ready to work in on its own."}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          How many copies
        </p>
        <div className="inline-flex items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          <button
            onClick={() => changeCount(count - 1)}
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
              if (!Number.isNaN(n)) changeCount(n);
            }}
            inputMode="numeric"
            className="h-9 w-11 border-x border-[var(--border)] bg-transparent text-center text-sm font-semibold text-[var(--text-primary)] outline-none"
          />
          <button
            onClick={() => changeCount(count + 1)}
            disabled={count >= MAX_COUNT}
            className="flex h-9 w-9 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
            aria-label="More copies"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {single ? "Label" : "Folder & labels"}
        </p>

        {!single && (
          <>
            <div className="relative mt-2">
              <Folder
                size={15}
                className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                  hasGroup ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"
                }`}
              />
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Folder name (optional)"
                className={`${FIELD_CLASS} transition-colors py-2 pl-9 pr-3`}
              />
            </div>
            {folderOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {folderOptions.map((n) => {
                  const active = trimmedGroup.toLowerCase() === n.toLowerCase();
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setGroupName(active ? "" : n)}
                      title={n}
                      className={`flex max-w-[160px] items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? "border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 text-[var(--text-primary)]"
                          : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Folder size={11} className="shrink-0 opacity-70" />
                      <span className="min-w-0 truncate">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div
          className={`${single ? "mt-2" : "mt-2.5"} max-h-[180px] overflow-y-auto pr-0.5`}
        >
          <div className={`relative ${single ? "" : "pl-6"}`}>
            <div className="space-y-1.5">
              {labels.map((value, i) => (
                <div key={i} className="relative">
                  {!single && (
                    <>
                      <span
                        className={`pointer-events-none absolute left-[-13px] top-1/2 h-px w-[13px] -translate-y-1/2 transition-colors ${railColor}`}
                      />
                      <span className="pointer-events-none absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                        {i + 1}
                      </span>
                    </>
                  )}
                  <input
                    value={value}
                    onChange={(e) => setLabelAt(i, e.target.value)}
                    autoFocus={i === 0}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="Auto-named"
                    className={`${FIELD_CLASS} transition-colors py-2 pr-3 ${single ? "pl-3" : "pl-10"}`}
                  />
                </div>
              ))}
            </div>
            {!single && (
              <span
                className={`pointer-events-none absolute bottom-4 left-[11px] top-0 w-px transition-colors ${railColor}`}
              />
            )}
          </div>
        </div>

        <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
          {single
            ? "A label to recognize the copy by. Leave blank to name it automatically."
            : hasGroup
              ? `The copies are grouped under “${trimmedGroup}” in the sidebar. Leave a label blank to name it automatically.`
              : "Name a folder above to keep the copies together in the sidebar, or leave it blank to add them on their own. Leave a label blank to name it automatically."}
        </p>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Run on {copyRef}
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
            className={`mt-2 ${FIELD_CLASS} px-3 py-2.5 font-mono`}
          />
        )}

        {mode !== "none" && (
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {mode === "command"
              ? `Runs in a terminal on ${copyRef} as soon as it's created.`
              : `Starts on ${copyRef} in the background as soon as it's created.`}
          </p>
        )}

        {mode !== "none" && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Prompt
            </p>
            <PromptComposer
              value={prompt}
              onChange={setPrompt}
              images={promptImages}
              onImagesChange={setPromptImages}
              placeholder="Type a task for an AI agent, and paste or attach images…"
            />
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Sent to {copyRef}'s terminal once it's ready — e.g. a task for the
              agent, with any attached images. Leave blank to send nothing.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-2">
        {renderToggle(
          excludeUncommitted,
          setExcludeUncommitted,
          <GitBranch size={16} />,
          "Committed work only",
          `Reset ${copyRef} to the last commit, dropping uncommitted changes.`,
        )}
        {renderToggle(
          reinstallDeps,
          setReinstallDeps,
          <Package size={16} />,
          "Reinstall dependencies",
          `Copy without dependencies, then install them fresh in ${copyRef}.`,
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
          disabled={!project || imagesPending}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
        >
          {imagesPending ? "Attaching images…" : `Create ${count} ${noun}`}
        </button>
      </div>
    </Modal>
  );
}
