import { useEffect, useState } from "react";
import { Folder, GitBranch, Package } from "lucide-react";
import { useEventListener } from "../hooks/useEventListener";
import { Modal } from "./ui/Modal";
import { ActionPicker } from "./ActionPicker";
import { PromptComposer, type PromptImage } from "./PromptComposer";
import { CopyRow } from "./CopyRow";
import { ShellCommandInput } from "./ShellCommandInput";
import { SwitchRow } from "./SwitchRow";
import { SegmentedControl } from "./ui/SegmentedControl";
import { CARD_CLASS, FIELD_CLASS, HELPER_TEXT, SECTION_LABEL } from "./ui/fields";
import { getSettings, saveSettings } from "../store/settings";
import { shellQuote } from "../terminal-io";
import type {
  CopyOverride,
  CopyRunMode,
  ProjectInfo,
  RunMode,
  SpawnTask,
} from "../types";

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

// One draft copy: its display label plus an optional per-copy run override.
// `override === null` means the copy runs the shared default below.
interface CopyDraft {
  label: string;
  override: CopyOverride | null;
}

export interface BulkDuplicateOptions {
  excludeUncommitted: boolean;
  reinstallDeps: boolean;
  labels: string[];
  // One entry per copy (index-aligned with `labels`): the tasks to run on that
  // copy, resolved from either its override or the shared default.
  tasksPerCopy: SpawnTask[][];
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
  const [copies, setCopies] = useState<CopyDraft[]>([
    { label: "", override: null },
  ]);
  const count = copies.length;
  // The shared default applied to every copy that doesn't override it.
  const [mode, setMode] = useState<RunMode>("none");
  const [actionName, setActionName] = useState("");
  const [command, setCommand] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptImages, setPromptImages] = useState<PromptImage[]>([]);
  // Which copy's override editor is expanded (`null` = none).
  const [editing, setEditing] = useState<number | null>(null);
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
    setCopies([{ label: genLabel(), override: null }]);
    setMode("none");
    setActionName("");
    setCommand("");
    setPrompt("");
    setPromptImages([]);
    setEditing(null);
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

  // Keep one draft per copy: grow with fresh default-named, default-running
  // copies, shrink by trimming, and preserve copies the user already tuned.
  const changeCount = (next: number) => {
    const n = clamp(next);
    setCopies((prev) => {
      if (n <= prev.length) {
        const trimmed = prev.slice(0, n);
        // A single copy has no per-copy override UI, so drop any override left
        // over from a higher count — otherwise it would silently still apply.
        return n === 1 && trimmed[0]?.override
          ? [{ ...trimmed[0], override: null }]
          : trimmed;
      }
      const out = prev.slice();
      while (out.length < n) out.push({ label: genLabel(), override: null });
      return out;
    });
    setEditing((e) => (e !== null && e >= n ? null : e));
  };

  const setLabelAt = (i: number, value: string) =>
    setCopies((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, label: value } : c)),
    );

  const setOverrideAt = (i: number, override: CopyOverride | null) =>
    setCopies((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, override } : c)),
    );

  const patchOverrideAt = (i: number, patch: Partial<CopyOverride>) =>
    setCopies((prev) =>
      prev.map((c, idx) =>
        idx === i && c.override
          ? { ...c, override: { ...c.override, ...patch } }
          : c,
      ),
    );

  // Switch a copy between inheriting the default and an explicit override. A
  // fresh override seeds from the default's action/command so the user starts
  // from a sensible base, with a clean (text-only) prompt.
  const pickCopyMode = (i: number, next: CopyRunMode) => {
    if (next === "default") return setOverrideAt(i, null);
    setCopies((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const seeded: CopyOverride = c.override
          ? { ...c.override, mode: next }
          : { mode: next, actionName, command, prompt: "" };
        // Switching to "action" needs a concrete action — fall back to the
        // first runnable when neither the default nor a prior override set one.
        if (next === "action" && !seeded.actionName)
          seeded.actionName = runnableActions[0]?.name ?? "";
        return { ...c, override: seeded };
      }),
    );
  };

  const single = count === 1;
  const noun = single ? "copy" : "copies";
  const copyRef = single ? "the copy" : "each copy";
  const folderOptions = Array.from(
    new Set(folderNames.map((n) => n.trim()).filter(Boolean)),
  );
  const trimmedGroup = groupName.trim();
  const hasGroup = !single && trimmedGroup.length > 0;
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

  // The seed is typed into the terminal as one line then submitted, so flatten
  // newlines and append the saved image paths for the agent to pick up.
  const flattenSeed = (
    text: string,
    images: PromptImage[],
  ): string | undefined => {
    const t = text.replace(/\s*\n\s*/g, " ").trim();
    const paths = images.map((im) => im.path).filter(Boolean).map(shellQuote);
    return [t, ...paths].filter(Boolean).join(" ") || undefined;
  };

  const taskFrom = (
    m: RunMode,
    act: string,
    cmd: string,
    seed: string | undefined,
  ): SpawnTask[] => {
    if (m === "action" && act)
      return [{ kind: "action", actionName: act, prompt: seed }];
    if (m === "command" && cmd.trim())
      return [{ kind: "command", command: cmd.trim(), prompt: seed }];
    return [];
  };

  const buildTasksPerCopy = (): SpawnTask[][] => {
    const defaultTask = taskFrom(
      mode,
      actionName,
      command,
      flattenSeed(prompt, promptImages),
    );
    return copies.map((c) =>
      c.override
        ? taskFrom(
            c.override.mode,
            c.override.actionName,
            c.override.command,
            flattenSeed(c.override.prompt, []),
          )
        : defaultTask,
    );
  };

  const overrideSummary = (override: CopyOverride | null): string => {
    if (!override) return "Default";
    if (override.mode === "none") return "Nothing";
    if (override.mode === "command") return "Command";
    const a = runnableActions.find((x) => x.name === override.actionName);
    return `Action: ${a?.label || a?.name || override.actionName || "—"}`;
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
      labels: copies.map((c) => c.label.trim()),
      tasksPerCopy: buildTasksPerCopy(),
      groupName: single ? "" : trimmedGroup,
    });
  };

  // Enter confirms from the count or command field; leave it to the focused
  // control when a button (segment, picker option, toggle) has focus, and let
  // Shift+Enter add a newline while composing a prompt.
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

  const runOptions: { value: RunMode; label: string; disabled?: boolean }[] = [
    { value: "none", label: "Nothing" },
    { value: "action", label: "Action", disabled: runnableActions.length === 0 },
    { value: "command", label: "Command" },
  ];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName="max-h-[85vh] w-[min(540px,92vw)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Duplicate
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            Create independent copies of{" "}
            <span className="font-mono text-[var(--text-secondary)]">
              {project?.label || project?.name}
            </span>{" "}
            to run agents or services in parallel.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className={SECTION_LABEL}>Copies</span>
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
              <button
                type="button"
                onClick={() => changeCount(count - 1)}
                disabled={count <= MIN_COUNT}
                className="flex h-8 w-8 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
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
                className="h-8 w-11 border-x border-[var(--border)] bg-transparent text-center text-[13px] font-semibold tabular-nums text-[var(--text-primary)] outline-none"
              />
              <button
                type="button"
                onClick={() => changeCount(count + 1)}
                disabled={count >= MAX_COUNT}
                className="flex h-8 w-8 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
                aria-label="More copies"
              >
                +
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-4 py-3">
            {single ? (
              <div>
                <div className="flex items-center gap-3">
                  <span className={SECTION_LABEL}>Label</span>
                  <input
                    value={copies[0]?.label ?? ""}
                    onChange={(e) => setLabelAt(0, e.target.value)}
                    autoFocus
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="Auto-named"
                    className={`${FIELD_CLASS} h-9 flex-1 px-3`}
                  />
                </div>
                <p className={`mt-2 ${HELPER_TEXT}`}>
                  A label to recognize the copy by. Leave blank to name it
                  automatically.
                </p>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Folder
                    size={14}
                    className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                      hasGroup
                        ? "text-[var(--accent-cyan)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  />
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="Folder name (optional)"
                    className={`${FIELD_CLASS} h-9 pl-9 pr-3`}
                  />
                </div>

                {folderOptions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {folderOptions.map((n) => {
                      const active =
                        trimmedGroup.toLowerCase() === n.toLowerCase();
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setGroupName(active ? "" : n)}
                          title={n}
                          className={`max-w-[160px] truncate rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[12px] transition-colors ${
                            active
                              ? "font-medium text-[var(--accent-cyan)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 space-y-1.5">
                  {copies.map((copy, i) => (
                    <CopyRow
                      key={i}
                      index={i}
                      label={copy.label}
                      onLabelChange={(value) => setLabelAt(i, value)}
                      override={copy.override}
                      summary={overrideSummary(copy.override)}
                      expanded={editing === i}
                      onToggleExpand={() => setEditing(editing === i ? null : i)}
                      actions={runnableActions}
                      onChangeMode={(m) => pickCopyMode(i, m)}
                      onPatchOverride={(patch) => patchOverrideAt(i, patch)}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <p className={`mt-2 ${HELPER_TEXT}`}>
                  {hasGroup
                    ? `The copies are grouped under “${trimmedGroup}” in the sidebar.`
                    : "Name a folder above to keep the copies together in the sidebar, or leave it blank."}{" "}
                  Use the menu beside a copy to run a different action or command
                  on it.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className={`${CARD_CLASS} px-4 py-3`}>
          <div className="flex items-center justify-between gap-3">
            <span className={SECTION_LABEL}>
              {single ? "Run on the copy" : "Run on each copy"}
            </span>
            <SegmentedControl
              value={mode}
              options={runOptions}
              onChange={pickMode}
            />
          </div>

          {mode === "action" && (
            <div className="field-reveal">
              <ActionPicker
                actions={runnableActions}
                value={actionName}
                onChange={setActionName}
              />
            </div>
          )}

          {mode === "command" && (
            <div className="mt-2 field-reveal">
              <ShellCommandInput value={command} onChange={setCommand} autoFocus />
            </div>
          )}

          {mode !== "none" && (
            <>
              <p className={`mt-1.5 ${HELPER_TEXT}`}>
                {mode === "command"
                  ? `Runs in a terminal on ${copyRef} as soon as it's created.`
                  : `Starts on ${copyRef} in the background as soon as it's created.`}
              </p>

              <div className="mt-3 field-reveal">
                <span className={SECTION_LABEL}>Prompt</span>
                <PromptComposer
                  value={prompt}
                  onChange={setPrompt}
                  images={promptImages}
                  onImagesChange={setPromptImages}
                  placeholder="Type a task for an AI agent, and paste or attach images…"
                />
                <p className={`mt-1.5 ${HELPER_TEXT}`}>
                  Sent to {copyRef}'s terminal once it's ready — e.g. a task for
                  the agent, with any attached images. Leave blank to send
                  nothing.
                </p>
              </div>
            </>
          )}
        </div>

        <div
          className={`${CARD_CLASS} divide-y divide-[var(--border)] overflow-hidden`}
        >
          <SwitchRow
            checked={excludeUncommitted}
            onChange={setExcludeUncommitted}
            icon={<GitBranch size={18} />}
            title="Committed work only"
            description={`Reset ${copyRef} to the last commit, dropping uncommitted changes.`}
          />
          <SwitchRow
            checked={reinstallDeps}
            onChange={setReinstallDeps}
            icon={<Package size={18} />}
            title="Reinstall dependencies"
            description={`Copy without dependencies, then install them fresh in ${copyRef}.`}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!project || imagesPending}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {imagesPending ? "Attaching images…" : `Create ${count} ${noun}`}
        </button>
      </div>
    </Modal>
  );
}
