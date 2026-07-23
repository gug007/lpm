import { useEffect, useMemo, useState } from "react";
import { Folder, GitBranch, Package, RefreshCw, X } from "lucide-react";
import { useEventListener } from "../hooks/useEventListener";
import { Modal } from "./ui/Modal";
import { ActionPicker } from "./ActionPicker";
import {
  InputComposer,
  EMPTY_COMPOSER,
  type ComposerValue,
} from "./InputComposer";
import { splitByImageTokens } from "./composerEditor";
import { CopyRow } from "./CopyRow";
import { CopyMacSelect, type CopyTargetOption } from "./CopyMacSelect";
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
import { useAppStore } from "../store/app";
import { usePeerState } from "../peer/usePeerState";
import { isPeerName, peerSlugOf, stripMarker } from "../peer/markers";
import { detectAICLI } from "../slashCommands";
import { findActionByPath, flattenRunnableActions } from "../actionTree";
import { findParentProject, projectDisplayName } from "./ProjectNameDisplay";
import type {
  CopyOverride,
  CopyRunMode,
  DuplicateMode,
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
const DUPLICATE_MODE_OPTIONS: { value: DuplicateMode; label: string }[] = [
  { value: "copy", label: "Standalone copy" },
  { value: "worktree", label: "Git worktree" },
];

function randomId6(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += NAME_ALPHABET[bytes[i] % NAME_ALPHABET.length];
  }
  return out;
}

// One draft copy: its display label, an optional per-copy run override
// (`override === null` means the copy runs the shared default below), and the
// project it's duplicated from — the source itself, or the same project on
// another connected Mac.
interface CopyDraft {
  label: string;
  override: CopyOverride | null;
  target: string;
}

export interface BulkDuplicateOptions {
  mode: DuplicateMode;
  excludeUncommitted: boolean;
  reinstallDeps: boolean;
  pullLatest: boolean;
  labels: string[];
  // One entry per copy (index-aligned with `labels`): the tasks to run on that
  // copy, resolved from either its override or the shared default.
  tasksPerCopy: SpawnTask[][];
  // Index-aligned with `labels`: the project each copy is duplicated FROM (a
  // local name or a prefixed peer name), so a copy can be created on whichever
  // Mac already has the project. No files ever move between machines.
  targetsPerCopy: string[];
  groupName: string;
}

// Everything the "run in duplicates" flow (a composer's split button) hands the
// dialog to pre-fill itself: the current prompt (text + attachments), how many
// copies to spin up, and how each copy runs it — the originating project action
// when the terminal was launched from one (preferred, since the action
// regenerates a clean command per copy), otherwise the raw launch command.
export interface DuplicatePromptSeed {
  prompt: ComposerValue;
  count: number;
  command?: string;
  actionName?: string;
}

interface BulkDuplicateDialogProps {
  open: boolean;
  project: ProjectInfo | null;
  // The target lives on a paired Mac. Sidebar folders are a local-only concept
  // (peer projects render in their own flat section), so the folder-grouping
  // field is hidden — the copies are created on the host.
  remote?: boolean;
  folderNames: string[];
  // Opened from a composer's "run in duplicates": pre-fill the shared prompt,
  // the copy count, and how each copy runs it — the originating project action
  // when the terminal came from one (preferred), else the raw agent command.
  // When set, the run section stays collapsed and these one-off choices are NOT
  // persisted as the user's duplicate defaults.
  seed?: DuplicatePromptSeed;
  onCancel: () => void;
  onConfirm: (count: number, opts: BulkDuplicateOptions) => void;
}

export function BulkDuplicateDialog({
  open,
  project,
  remote = false,
  folderNames,
  seed,
  onCancel,
  onConfirm,
}: BulkDuplicateDialogProps) {
  const seeded = seed !== undefined;
  const [copies, setCopies] = useState<CopyDraft[]>([
    { label: "", override: null, target: "" },
  ]);
  const count = copies.length;
  // The shared default applied to every copy that doesn't override it.
  const [mode, setMode] = useState<RunMode>("none");
  const [actionName, setActionName] = useState("");
  const [command, setCommand] = useState("");
  const [composer, setComposer] = useState<ComposerValue>(EMPTY_COMPOSER);
  // Which copy's override editor is expanded (`null` = none).
  const [editing, setEditing] = useState<number | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("copy");
  const [excludeUncommitted, setExcludeUncommitted] = useState(false);
  const [reinstallDeps, setReinstallDeps] = useState(false);
  const [pullLatest, setPullLatest] = useState(true);
  const [groupName, setGroupName] = useState("");
  // Whether the folder-name autocomplete suggestions are showing.
  const [folderOpen, setFolderOpen] = useState(false);
  // Persisted open/closed state of the collapsible cards (collapsed by default).
  const [runOpen, setRunOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Bumped each time the dialog opens. Keys the shared prompt composer so it
  // remounts against the freshly reset state below — the dialog can stay mounted
  // across open/close (Sidebar's Duplicate), and without this a reopened field
  // would keep seeding from the previous session's retained draft.
  const [openSession, setOpenSession] = useState(0);

  // Every place this project already exists — here and on connected Macs with a
  // same-named project. A copy targeted at another Mac is created THERE by
  // duplicating that Mac's own project; no files ever move between machines.
  const projects = useAppStore((s) => s.projects);
  const projectDisplay = project
    ? projectDisplayName(project, findParentProject(project, projects))
    : "";

  // Default each label to the copy's would-be name (`<original>-<id>`), the
  // same scheme the backend uses for the folder, so the field shows the copy's
  // name rather than the original's.
  const base = project?.parentName || project?.name;
  const genLabel = () => (base ? `${base}-${randomId6()}` : "");
  // Shown as run #1 in the seeded (composer) flow — the current project runs the
  // prompt in place, so it's listed above the fresh copies rather than created.
  const currentName = projectDisplay || "This project";

  // The full action tree drives the picker (it drills into menus / split
  // buttons); the flattened runnable set is for "is anything runnable?" checks,
  // default seeding, and resolving the selected action by name.
  const actionTree = project?.actions ?? [];
  const runnableActions = flattenRunnableActions(actionTree);

  const { state: peerState } = usePeerState();
  const sourceName = project?.name ?? "";
  const rawName = stripMarker(sourceName);
  const targets = useMemo<CopyTargetOption[]>(() => {
    if (!sourceName) return [];
    const out: CopyTargetOption[] = [];
    if (projects.some((p) => !isPeerName(p.name) && p.name === rawName)) {
      out.push({ name: rawName, label: "This Mac" });
    }
    for (const peer of peerState.peers) {
      if (!peer.connected) continue;
      const match = projects.find(
        (p) => peerSlugOf(p.name) === peer.slug && stripMarker(p.name) === rawName,
      );
      if (match) out.push({ name: match.name, label: peer.alias || peer.host });
    }
    if (!out.some((t) => t.name === sourceName)) {
      const slug = peerSlugOf(sourceName);
      const peer = peerState.peers.find((p) => p.slug === slug);
      out.unshift({
        name: sourceName,
        label: slug ? peer?.alias || peer?.host || "Connected Mac" : "This Mac",
      });
    }
    return out;
  }, [projects, peerState.peers, sourceName, rawName]);
  const showTargets = targets.length > 1;

  // A Mac can disconnect while the dialog is open, removing its entry from
  // `targets` — remap any copy still pointing at it back to the source location
  // so a stale target is never submitted (and the select never renders a value
  // outside its options).
  useEffect(() => {
    if (!sourceName || targets.length === 0) return;
    const valid = new Set(targets.map((t) => t.name));
    const fallback = valid.has(sourceName) ? sourceName : targets[0].name;
    setCopies((prev) =>
      prev.some((c) => c.target !== "" && !valid.has(c.target))
        ? prev.map((c) =>
            c.target !== "" && !valid.has(c.target) ? { ...c, target: fallback } : c,
          )
        : prev,
    );
  }, [targets, sourceName]);

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
    // Seed the copy count from the menu's counter (clamped), else one copy.
    const initialCount = seed?.count ? clamp(seed.count) : 1;
    setCopies(
      Array.from({ length: initialCount }, () => ({
        label: genLabel(),
        override: null,
        target: project?.name ?? "",
      })),
    );
    // Prefer running the originating action (a clean, re-resolved command per
    // copy) over replaying the raw launch command; fall back to the saved mode
    // when nothing is seeded.
    const seededMode: RunMode = seed?.actionName
      ? "action"
      : seed?.command !== undefined
        ? "command"
        : savedMode;
    setMode(seededMode);
    setActionName(seed?.actionName ?? savedAction);
    setCommand(seed?.command ?? s.duplicateCommand ?? "");
    setComposer(seed?.prompt ?? EMPTY_COMPOSER);
    setEditing(null);
    setDuplicateMode(s.duplicateMode ?? "copy");
    setExcludeUncommitted(s.duplicateExcludeUncommitted ?? false);
    setReinstallDeps(s.duplicateReinstallDeps ?? false);
    setPullLatest(s.duplicatePullLatest ?? true);
    setGroupName("");
    setFolderOpen(false);
    // A composer-seeded run stays collapsed — its target/prompt are already set
    // and summarized in the section header, so the dialog opens uncluttered.
    setRunOpen(seeded ? false : (s.duplicateRunSectionOpen ?? false));
    setOptionsOpen(s.duplicateOptionsSectionOpen ?? false);
    setOpenSession((n) => n + 1);
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
      while (out.length < n)
        out.push({ label: genLabel(), override: null, target: project?.name ?? "" });
      return out;
    });
    setEditing((e) => (e !== null && e >= n ? null : e));
  };

  const setLabelAt = (i: number, value: string) =>
    setCopies((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, label: value } : c)),
    );

  const setTargetAt = (i: number, target: string) =>
    setCopies((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, target } : c)),
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
  const isWorktree = duplicateMode === "worktree";
  const item = isWorktree ? "worktree" : "copy";
  const noun = single ? item : isWorktree ? "worktrees" : "copies";
  const copyRef = single ? `the ${item}` : `each ${item}`;
  // With a per-copy Mac picker the dialog's "remote-ness" is per copy; without
  // one it falls back to the source-level `remote` prop.
  const targetOf = (c: CopyDraft) => c.target || sourceName;
  const anyRemoteCopy = showTargets ? copies.some((c) => isPeerName(targetOf(c))) : remote;
  const anyLocalCopy = showTargets ? copies.some((c) => !isPeerName(targetOf(c))) : !remote;
  const folderOptions = Array.from(
    new Set(folderNames.map((n) => n.trim()).filter(Boolean)),
  );
  const trimmedGroup = groupName.trim();
  const hasGroup = !single && anyLocalCopy && trimmedGroup.length > 0;
  // Hold submit while any prompt — the shared default or a per-copy override —
  // still has an image saving to disk.
  const imagesPending =
    composer.pending || copies.some((c) => c.override?.prompt.pending);

  // When the "Run on each copy" section resolves to an actual task, the confirm
  // button leads with that action ("Run on …"); with nothing to run it's just
  // "Create …". Mirrors taskFrom so the verb matches what will actually happen.
  const defaultRuns =
    (mode === "action" && actionName.trim().length > 0) ||
    (mode === "command" && command.trim().length > 0);
  const confirmLabel = imagesPending
    ? "Attaching images…"
    : seeded
      ? `Run ${count + 1} in parallel`
      : defaultRuns
        ? single
          ? `Run on the ${item}`
          : `Run on ${count} ${noun}`
        : `Create ${count} ${noun}`;

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
      isWorktree && "New Git branch",
      !isWorktree && excludeUncommitted && "Committed only",
      !isWorktree && pullLatest && "Pull latest",
      reinstallDeps && (isWorktree ? "Install deps" : "Reinstall"),
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

  // Resolve the composer's `[Image #N]` tokens for delivery once the copy's
  // agent is ready. A text-only prompt is one flattened line; with images the
  // seed becomes ordered paste parts — each image path is its own part (raw,
  // space-padded, not shell-quoted) so the agent lifts it into an image the
  // same way a manual composer send does, instead of it arriving as quoted text.
  const composerSeed = (value: ComposerValue): string | string[] | undefined => {
    const byToken = new Map(value.images.map((im) => [im.token, im.path]));
    const segments = splitByImageTokens(value.text);
    const hasImages = segments.some((s) => s.image !== null && byToken.has(s.image));
    if (!hasImages) {
      return flatten(value.text.replace(/\[Image #\d+\]/g, "")) || undefined;
    }
    const parts = segments
      .map((s) => {
        if (s.image === null) return flatten(s.text);
        const path = byToken.get(s.image);
        return path ? ` ${path} ` : "";
      })
      .filter((p) => p.trim().length > 0);
    return parts.length ? parts : undefined;
  };

  const taskFrom = (
    m: RunMode,
    act: string,
    cmd: string,
    seed: string | string[] | undefined,
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
    // A seeded (composer-triggered) run points at that terminal's agent command
    // for this one duplication — don't let it overwrite the user's remembered
    // "run on each copy" defaults for the normal Duplicate flow.
    if (!seeded) {
      saveSettings({
        duplicateMode,
        duplicateExcludeUncommitted: excludeUncommitted,
        duplicateReinstallDeps: reinstallDeps,
        duplicatePullLatest: pullLatest,
        duplicateRunMode: mode,
        duplicateActionName: actionName || undefined,
        duplicateCommand: command || undefined,
      });
    }
    const valid = new Set(targets.map((t) => t.name));
    const fallback = valid.has(sourceName) || targets.length === 0 ? sourceName : targets[0].name;
    onConfirm(count, {
      mode: duplicateMode,
      excludeUncommitted: isWorktree ? false : excludeUncommitted,
      reinstallDeps,
      pullLatest: isWorktree ? false : pullLatest,
      labels: copies.map((c) => c.label.trim()),
      tasksPerCopy: buildTasksPerCopy(),
      targetsPerCopy: copies.map((c) => {
        const t = targetOf(c);
        return valid.size === 0 || valid.has(t) ? t : fallback;
      }),
      groupName: single || !anyLocalCopy ? "" : trimmedGroup,
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
      draggable
      zIndexClassName="z-[60]"
      contentClassName="flex max-h-[85vh] w-[min(680px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        data-modal-drag-handle
        className="flex shrink-0 items-start gap-3 px-6 pb-1 pt-6"
      >
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
            {isWorktree
              ? "Create linked Git worktrees for "
              : "Create standalone copies of "}
            <span className="font-mono text-[var(--text-secondary)]">
              {projectDisplay}
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6 pt-5">
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className={SECTION_LABEL}>Copy method</span>
            <SegmentedControl
              value={duplicateMode}
              options={DUPLICATE_MODE_OPTIONS}
              onChange={setDuplicateMode}
              ariaLabel="Copy method"
            />
          </div>
          <p
            className={`border-t border-[var(--border)] px-4 py-3 ${HELPER_TEXT}`}
          >
            {isWorktree
              ? "Creates a branch from the current commit and shares Git history. Uncommitted and ignored files stay behind; the project root must be the Git root."
              : "Creates an independent APFS copy that can also include uncommitted and ignored files."}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className={SECTION_LABEL}>
              {seeded ? "Parallel runs" : isWorktree ? "Worktrees" : "Copies"}
            </span>
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
              <button
                type="button"
                onClick={() => changeCount(count - 1)}
                disabled={count <= MIN_COUNT}
                className="flex h-8 w-8 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
                aria-label={seeded ? "Fewer runs" : "Fewer copies"}
              >
                −
              </button>
              <input
                value={seeded ? count + 1 : count}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  if (!Number.isNaN(n)) changeCount(seeded ? n - 1 : n);
                }}
                inputMode="numeric"
                className="h-8 w-11 border-x border-[var(--border)] bg-transparent text-center text-[13px] font-semibold tabular-nums text-[var(--text-primary)] outline-none"
              />
              <button
                type="button"
                onClick={() => changeCount(count + 1)}
                disabled={count >= MAX_COUNT}
                className="flex h-8 w-8 items-center justify-center text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
                aria-label={seeded ? "More runs" : "More copies"}
              >
                +
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--border)] px-4 py-3">
            {!seeded && single ? (
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
                  {showTargets && (
                    <CopyMacSelect
                      options={targets}
                      value={copies[0] ? targetOf(copies[0]) : sourceName}
                      onChange={(v) => setTargetAt(0, v)}
                    />
                  )}
                </div>
                <p className={`mt-2 ${HELPER_TEXT}`}>
                  A label to recognize the {item} by. Leave blank to name it
                  automatically.
                  {showTargets &&
                    anyRemoteCopy &&
                    " The copy is created on the chosen Mac, from its own copy of the project."}
                </p>
              </div>
            ) : (
              <div>
                {!single && anyLocalCopy && (
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
                )}

                <div className={`space-y-1.5 ${!single ? "mt-3" : ""}`}>
                  {seeded && (
                    <div className="grid grid-cols-[1rem_1fr_6.5rem] items-center gap-2.5">
                      <span className="text-right text-[12px] tabular-nums text-[var(--text-muted)]">
                        1
                      </span>
                      <div className="flex h-9 items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3">
                        <span className="truncate text-[13px] text-[var(--text-secondary)]">
                          {currentName}
                        </span>
                      </div>
                      <span className="text-right text-[12px] font-medium text-[var(--text-muted)]">
                        Current
                      </span>
                    </div>
                  )}
                  {copies.map((copy, i) => (
                    <CopyRow
                      key={i}
                      index={seeded ? i + 1 : i}
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
                      targets={showTargets ? targets : undefined}
                      target={targetOf(copy)}
                      onTargetChange={(v) => setTargetAt(i, v)}
                      history={composerHistory}
                      aiCwd={aiCwd}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <p className={`mt-2 ${HELPER_TEXT}`}>
                  {seeded
                    ? `Run #1 is ${currentName} — the prompt runs in its existing terminal; the rest are fresh copies.`
                    : anyRemoteCopy && !anyLocalCopy
                      ? showTargets
                        ? "The copies are created on the chosen Mac, from its own copy of the project."
                        : "The copies are created on the connected Mac."
                      : hasGroup
                        ? `The copies are grouped under “${trimmedGroup}” in the sidebar.`
                        : "Name a folder above to keep the copies together in the sidebar, or leave it blank."}
                  {anyRemoteCopy &&
                    (anyLocalCopy || seeded) &&
                    " Copies set to another Mac are created there, from that Mac's own copy of the project."}{" "}
                  Use the menu beside a copy to run a different action or command
                  on it.
                </p>
              </div>
            )}
          </div>
        </div>

        <CollapsibleSection
          title={single ? `Run on the ${item}` : `Run on each ${item}`}
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
                      key={openSession}
                      onChange={setComposer}
                      defaultValue={composer}
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
            {!isWorktree && (
              <>
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
              </>
            )}
            <SwitchRow
              checked={reinstallDeps}
              onChange={setReinstallDeps}
              icon={<Package size={18} />}
              title={
                isWorktree ? "Install dependencies" : "Reinstall dependencies"
              }
              description={
                isWorktree
                  ? `Install dependencies in ${copyRef} after Git creates it.`
                  : `Copy without dependencies, then install them fresh in ${copyRef}.`
              }
            />
          </div>
        </CollapsibleSection>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-6 pb-6 pt-4">
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
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
