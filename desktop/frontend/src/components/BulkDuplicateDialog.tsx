import { useEffect, useState } from "react";
import { Folder, GitBranch, Package, RefreshCw, X } from "lucide-react";
import { useEventListener } from "../hooks/useEventListener";
import { Modal } from "./ui/Modal";
import { ActionPicker } from "./ActionPicker";
import {
  InputComposer,
  EMPTY_COMPOSER,
  type ComposerValue,
} from "./InputComposer";
import { CopyRow } from "./CopyRow";
import { ShellCommandInput } from "./ShellCommandInput";
import { SwitchRow } from "./SwitchRow";
import { CollapsibleSection } from "./CollapsibleSection";
import { SegmentedControl } from "./ui/SegmentedControl";
import {
  CARD_CLASS,
  FIELD_CLASS,
  HELPER_TEXT,
  SECTION_LABEL,
} from "./ui/fields";
import { getSettings, saveSettings } from "../store/settings";
import { shellQuote } from "../terminal-io";
import { detectAICLI } from "../slashCommands";
import { findActionByPath, flattenRunnableActions } from "../actionTree";
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
const NAME_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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
  pullLatest: boolean;
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
  const [composer, setComposer] = useState<ComposerValue>(EMPTY_COMPOSER);
  // Which copy's override editor is expanded (`null` = none).
  const [editing, setEditing] = useState<number | null>(null);
  const [excludeUncommitted, setExcludeUncommitted] = useState(false);
  const [reinstallDeps, setReinstallDeps] = useState(false);
  const [pullLatest, setPullLatest] = useState(true);
  const [groupName, setGroupName] = useState("");
  // Whether the folder-name autocomplete suggestions are showing.
  const [folderOpen, setFolderOpen] = useState(false);
  // Persisted open/closed state of the collapsible cards (collapsed by default).
  const [runOpen, setRunOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Default each label to the copy's would-be name (`<original>-<id>`), the
  // same scheme the backend uses for the folder, so the field shows the copy's
  // name rather than the original's.
  const base = project?.parentName || project?.name;
  const genLabel = () => (base ? `${base}-${randomId6()}` : "");

  // The full action tree drives the picker (it drills into menus / split
  // buttons); the flattened runnable set is for "is anything runnable?" checks,
  // default seeding, and resolving the selected action by name.
  const actionTree = project?.actions ?? [];
  const runnableActions = flattenRunnableActions(actionTree);

  useEffect(() => {
    if (!open) return;
    const s = getSettings();
    // Restore the last "run on the copy" choice, but only land on Action when
    // this project has runnable actions, and only keep a saved action that's
    // still offered — otherwise fall back to the first one.
    const savedAction =
      runnableActions.find((a) => a.name === s.duplicateActionName)?.name ??
      runnableActions[0]?.name ??
      "";
    const savedMode: RunMode =
      s.duplicateRunMode === "action" && runnableActions.length > 0
        ? "action"
        : s.duplicateRunMode === "command"
          ? "command"
          : "none";
    setCopies([{ label: genLabel(), override: null }]);
    setMode(savedMode);
    setActionName(savedAction);
    setCommand(s.duplicateCommand ?? "");
    setComposer(EMPTY_COMPOSER);
    setEditing(null);
    setExcludeUncommitted(s.duplicateExcludeUncommitted ?? false);
    setReinstallDeps(s.duplicateReinstallDeps ?? false);
    setPullLatest(s.duplicatePullLatest ?? true);
    setGroupName("");
    setFolderOpen(false);
    setRunOpen(s.duplicateRunSectionOpen ?? false);
    setOptionsOpen(s.duplicateOptionsSectionOpen ?? false);
  }, [open, project?.name]);

  const toggleRunOpen = () => {
    const next = !runOpen;
    setRunOpen(next);
    saveSettings({ duplicateRunSectionOpen: next });
  };
  const toggleOptionsOpen = () => {
    const next = !optionsOpen;
    setOptionsOpen(next);
    saveSettings({ duplicateOptionsSectionOpen: next });
  };

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
          : { mode: next, actionName, command, prompt: EMPTY_COMPOSER };
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
  // Hold submit while any prompt — the shared default or a per-copy override —
  // still has an image saving to disk.
  const imagesPending =
    composer.pending || copies.some((c) => c.override?.prompt.pending);

  // The same history recall + AI-edit wiring is shared by the default composer
  // and every per-copy override composer.
  const composerHistory = project
    ? {
        terminalId: project.name,
        projectName: project.name,
        terminalLabel: project.name,
      }
    : undefined;
  const aiCwd = project?.root || undefined;

  // Existing folders that match what's typed (all of them when blank), minus an
  // exact match so the list disappears once a name is fully entered.
  const folderQuery = trimmedGroup.toLowerCase();
  const folderSuggestions = folderOptions.filter((n) => {
    const ln = n.toLowerCase();
    return ln.includes(folderQuery) && ln !== folderQuery;
  });

  // The prompt is a task for an AI agent, so only show it when the run target
  // actually launches one (claude / codex / …) — a non-agent action or command
  // has nothing to type a prompt into.
  const promptTargetCmd =
    mode === "action"
      ? runnableActions.find((a) => a.name === actionName)?.cmd
      : mode === "command"
        ? command
        : undefined;
  const showPrompt = detectAICLI(promptTargetCmd) !== null;

  // Recaps shown in each collapsed section's header.
  const selectedAction = findActionByPath(actionTree, actionName);
  const runSummary =
    mode === "none"
      ? "Nothing"
      : mode === "command"
        ? "Command"
        : selectedAction?.label || selectedAction?.name || "Action";
  const optionsSummary =
    [
      excludeUncommitted && "Committed only",
      pullLatest && "Pull latest",
      reinstallDeps && "Reinstall",
    ]
      .filter(Boolean)
      .join(" · ") || "None";

  const pickMode = (next: RunMode) => {
    setMode(next);
    if (next === "action" && !actionName && runnableActions.length > 0) {
      setActionName(runnableActions[0].name);
    }
  };

  // The seed is typed into the terminal as one line then submitted, so flatten
  // its newlines to spaces.
  const flatten = (text: string): string =>
    text
      .replace(/\s*\n\s*/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

  // Resolve the composer's `[Image #N]` tokens to shell-quoted paths in place,
  // then flatten — so a pasted image lands where the user put it in the prompt.
  const composerSeed = (value: ComposerValue): string | undefined => {
    const byToken = new Map(value.images.map((im) => [im.token, im.path]));
    const resolved = value.text.replace(/\[Image #(\d+)\]/g, (_, n) => {
      const path = byToken.get(Number(n));
      return path ? ` ${shellQuote(path)} ` : "";
    });
    return flatten(resolved) || undefined;
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
      showPrompt ? composerSeed(composer) : undefined,
    );
    return copies.map((c) =>
      c.override
        ? taskFrom(
            c.override.mode,
            c.override.actionName,
            c.override.command,
            composerSeed(c.override.prompt),
          )
        : defaultTask,
    );
  };

  const overrideSummary = (override: CopyOverride | null): string => {
    if (!override) return "Default";
    if (override.mode === "none") return "Nothing";
    if (override.mode === "command") return "Command";
    const a = findActionByPath(actionTree, override.actionName);
    return `Action: ${a?.label || a?.name || override.actionName || "—"}`;
  };

  const handleConfirm = () => {
    if (!project) return;
    saveSettings({
      duplicateExcludeUncommitted: excludeUncommitted,
      duplicateReinstallDeps: reinstallDeps,
      duplicatePullLatest: pullLatest,
      duplicateRunMode: mode,
      duplicateActionName: actionName || undefined,
      duplicateCommand: command || undefined,
    });
    onConfirm(count, {
      excludeUncommitted,
      reinstallDeps,
      pullLatest,
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
      const active = document.activeElement as HTMLElement | null;
      if (
        e.shiftKey &&
        (active instanceof HTMLTextAreaElement || active?.isContentEditable)
      )
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
    {
      value: "action",
      label: "Action",
      disabled: runnableActions.length === 0,
    },
    { value: "command", label: "Command" },
  ];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      backdrop={false}
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
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="-mr-1 -mt-1 ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
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
                    onChange={(e) => {
                      setGroupName(e.target.value);
                      setFolderOpen(true);
                    }}
                    onFocus={() => setFolderOpen(true)}
                    onBlur={() => setFolderOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && folderOpen) {
                        e.stopPropagation();
                        setFolderOpen(false);
                      }
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="Folder name (optional)"
                    className={`${FIELD_CLASS} h-9 pl-9 pr-3`}
                  />

                  {folderOpen && folderSuggestions.length > 0 && (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl">
                      {folderSuggestions.map((n) => (
                        <button
                          key={n}
                          type="button"
                          // Keep the input focused so the click lands before blur.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setGroupName(n);
                            setFolderOpen(false);
                          }}
                          title={n}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        >
                          <Folder
                            size={13}
                            className="shrink-0 text-[var(--text-muted)]"
                          />
                          <span className="min-w-0 flex-1 truncate">{n}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
                      onToggleExpand={() =>
                        setEditing(editing === i ? null : i)
                      }
                      actions={actionTree}
                      onChangeMode={(m) => pickCopyMode(i, m)}
                      onPatchOverride={(patch) => patchOverrideAt(i, patch)}
                      history={composerHistory}
                      aiCwd={aiCwd}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <p className={`mt-2 ${HELPER_TEXT}`}>
                  {hasGroup
                    ? `The copies are grouped under “${trimmedGroup}” in the sidebar.`
                    : "Name a folder above to keep the copies together in the sidebar, or leave it blank."}{" "}
                  Use the menu beside a copy to run a different action or
                  command on it.
                </p>
              </div>
            )}
          </div>
        </div>

        <CollapsibleSection
          title={single ? "Run on the copy" : "Run on each copy"}
          open={runOpen}
          onToggle={toggleRunOpen}
          summary={runSummary}
        >
          <div className="px-4 py-3">
            <SegmentedControl
              value={mode}
              options={runOptions}
              onChange={pickMode}
              fullWidth
            />

            {mode === "action" && (
              <div className="field-reveal">
                <ActionPicker
                  actions={actionTree}
                  value={actionName}
                  onChange={setActionName}
                />
              </div>
            )}

            {mode === "command" && (
              <div className="mt-2 field-reveal">
                <ShellCommandInput
                  value={command}
                  onChange={setCommand}
                  autoFocus
                />
              </div>
            )}

            {mode !== "none" && (
              <>
                <p className={`mt-1.5 ${HELPER_TEXT}`}>
                  {mode === "command"
                    ? `Runs in a terminal on ${copyRef} as soon as it's created.`
                    : `Starts on ${copyRef} in the background as soon as it's created.`}
                </p>

                {showPrompt && (
                  <div className="mt-3 field-reveal">
                    <InputComposer
                      onChange={setComposer}
                      placeholder="Type a task for an AI agent, and paste or attach images…"
                      history={composerHistory}
                      aiCwd={aiCwd}
                    />
                    <p className={`mt-1.5 ${HELPER_TEXT}`}>
                      Sent to {copyRef}'s terminal once it's ready — e.g. a task
                      for the agent, with any attached images. Leave blank to
                      send nothing.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Options"
          open={optionsOpen}
          onToggle={toggleOptionsOpen}
          summary={optionsSummary}
        >
          <div className="divide-y divide-[var(--border)]">
            <SwitchRow
              checked={excludeUncommitted}
              onChange={setExcludeUncommitted}
              icon={<GitBranch size={18} />}
              title="Committed work only"
              description={`Reset ${copyRef} to the last commit, dropping uncommitted changes.`}
            />
            <SwitchRow
              checked={pullLatest}
              onChange={setPullLatest}
              icon={<RefreshCw size={18} />}
              title="Pull latest changes"
              description={`Bring ${copyRef} up to the newest commits on its branch.`}
            />
            <SwitchRow
              checked={reinstallDeps}
              onChange={setReinstallDeps}
              icon={<Package size={18} />}
              title="Reinstall dependencies"
              description={`Copy without dependencies, then install them fresh in ${copyRef}.`}
            />
          </div>
        </CollapsibleSection>
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
