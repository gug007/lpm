import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { Modal } from "../../ui/Modal";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { VideoLink } from "../../ui/VideoLink";
import { ActionPicker } from "../../ActionPicker";
import { InputComposer } from "../../InputComposer";
import { EmojiSlotButton } from "../../EmojiPickerButton";
import { displayNameForProjectName } from "../../ProjectNameDisplay";
import { ClockIcon, XIcon } from "../../icons";
import { RowModelSelect } from "./RowModelSelect";
import { RunKindPicker } from "./RunKindPicker";
import { JobScopeRow } from "./JobScopeRow";
import { SendToConnectModal } from "./SendToConnectModal";
import type { ConnectIntent } from "../../../sendToConnectors";
import { JobFrequencyCard } from "./JobFrequencyCard";
import { JobCheckField } from "./JobCheckField";
import { CheckAIModal } from "./CheckAIModal";
import { JobEditorFooter } from "./JobEditorFooter";
import { ClearJobState } from "../../../../bridge/commands";
import {
  clearJobStateGlobal,
  deleteJob,
  deleteJobGlobal,
  readJobPayloadFrom,
} from "../../../jobsConfig";
import { useJobHost } from "./useJobHost";
import { saveJobDraft, scopeProject } from "../../../jobsSave";
import {
  defaultJobDraft,
  jobScopePhrase,
  payloadToDraft,
  validateJobDraft,
  type JobDraft,
  type JobInfo,
} from "../../../jobsFormat";
import { validateDraftSchedule } from "../../../jobsScheduleDraft";
import { EMPTY_COMPOSER, type ComposerValue } from "../../../composerValue";
import { checkTask } from "../../../jobsCheckAI";
import { findActionByPath } from "../../../actionTree";
import { detectAICLI } from "../../../slashCommands";
import { isDuplicate, type ActionInfo } from "../../../types";
import { useDiscardGuard } from "../../../hooks/useDiscardGuard";
import { useAppStore } from "../../../store/app";
import { useSettingsStore } from "../../../store/settings";
import { matchesChord } from "../../../keys";
import { JOBS_VIDEO_LENGTH, JOBS_VIDEO_URL } from "../../../jobsVideo";
import { isImeComposing } from "../../../imeComposing";

interface JobEditorModalProps {
  open: boolean;
  projects: string[];
  actionsFor: (project: string) => ActionInfo[];
  // Ids of the jobs currently visible for a project (null = across every
  // project) — a new job's id must not shadow one declared in another config
  // layer, or it would silently inherit that job's run history.
  knownIds?: (project: string | null) => string[];
  // null = create a new job; otherwise edit that project's job (its body is
  // read from the layer that defines it on open).
  editing: { project: string; job: JobInfo } | null;
  // The project a new job starts scoped to; absent = no project picked yet.
  newProject?: string;
  onClose: () => void;
  onSaved: () => void;
}

// Same prompt content — `pending` (an image still saving) aside.
function samePrompt(a: ComposerValue, b: ComposerValue): boolean {
  return (
    a.text === b.text &&
    a.images.length === b.images.length &&
    a.images.every(
      (im, i) => im.token === b.images[i].token && im.path === b.images[i].path,
    )
  );
}

export function JobEditorModal({
  open,
  projects,
  actionsFor,
  knownIds,
  editing,
  newProject,
  onClose,
  onSaved,
}: JobEditorModalProps) {
  const isEditing = editing !== null;
  const [draft, setDraft] = useState<JobDraft>(defaultJobDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCopies, setDeleteCopies] = useState(false);
  const [checkAIOpen, setCheckAIOpen] = useState(false);
  // The outside service being linked (or given another chat) from the editor.
  const [connecting, setConnecting] = useState<{ service: string; intent: ConnectIntent } | null>(
    null,
  );
  // Whether the user has edited anything yet — the "what's missing" hint
  // stays quiet on a freshly opened editor.
  const [touched, setTouched] = useState(false);
  // The composer is uncontrolled (its defaultValue is a mount-only seed), so it
  // is remounted whenever the draft is replaced wholesale — on open, and again
  // when an edited job's body arrives from disk.
  const [composerSession, setComposerSession] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<ComposerValue>(draft.prompt);

  const source = editing?.job.source ?? "project";
  // The machine the job runs on; its projects are the only ones it can name.
  const machine = useJobHost(open, editing, newProject);
  // The scope picker holds the projects the job runs in — for a new job and for
  // one being edited alike; empty = standalone. Exactly one project unlocks the
  // project-scoped features.
  const runProject = scopeProject(draft);
  // Actions belong to one project, so they need exactly one in scope.
  const actionsAvailable = runProject !== undefined;
  // A standalone job runs in the home folder, so there is no project to copy.
  const canDuplicate = draft.targets.length > 0 || draft.everyProject;
  const actions = actionsAvailable && runProject ? actionsFor(runProject) : [];
  // A terminal action that starts an agent CLI can be handed a prompt to work on.
  const selectedAction = findActionByPath(actions, draft.action);
  const actionAgent =
    selectedAction?.type === "terminal" ? detectAICLI(selectedAction.cmd) : null;
  const actionLaunchesAgent = actionAgent !== null;
  const defaultAgent = useSettingsStore((s) => s.aiCli) || "claude";
  // AI-edit runs in the project the job runs in; a standalone or multi-project
  // job has no single root, so it gets a plain prompt field.
  const storeProjects = useAppStore((s) => s.projects);
  // "Refine with AI" and prompt history both only need *a* project context — the
  // AI rewrites the prompt text and history can widen to every project. Before
  // one is picked (a new, standalone job) fall back to any local project so both
  // stay available; they retarget to the chosen project once one is selected.
  const contextProject =
    runProject ?? storeProjects.find((p) => !p.isRemote)?.name;
  const aiCwd = storeProjects.find((p) => p.name === contextProject)?.root;
  const composerHistory = contextProject
    ? {
        terminalId: contextProject,
        projectName: contextProject,
        terminalLabel: displayNameForProjectName(contextProject, storeProjects),
      }
    : undefined;
  // Memory sessions belong to one project, so the button needs exactly one in
  // scope — a standalone run has no project for the agent to save under.
  const memoryFor = (agent: string | null) =>
    runProject ? { project: runProject, agent } : undefined;

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setCheckAIOpen(false);
    setConnecting(null);
    setSaving(false);
    setTouched(false);
    setComposerSession((n) => n + 1);
    if (!editing) {
      setDraft(newProject ? { ...defaultJobDraft(), targets: [newProject] } : defaultJobDraft());
      setLoading(false);
      setTimeout(() => nameRef.current?.focus(), 50);
      return;
    }
    setLoading(true);
    let cancelled = false;
    readJobPayloadFrom(editing.project, editing.job.source ?? "project", editing.job.id)
      .then((payload) => {
        if (cancelled) return;
        const next = payload ? payloadToDraft(payload) : defaultJobDraft();
        // Only the shared layer carries a `projects` field: its absence there
        // means every project, while a project- or repo-layer job runs in the
        // one project whose config declares it.
        if (editing.job.source === "global") {
          next.everyProject = !Array.isArray(payload?.projects);
        } else {
          next.targets = [editing.project];
        }
        setDraft(next);
        setComposerSession((n) => n + 1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editing, newProject]);

  const patch = (values: Partial<JobDraft>) => {
    setTouched(true);
    setDraft((prev) => ({ ...prev, ...values }));
  };

  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => {
    patch({ [key]: value } as Partial<JobDraft>);
  };

  // An action needs a single project, so a wider scope falls back to a prompt.
  const setScope = (next: string[]) => {
    setTouched(true);
    setDraft((prev) => ({
      ...prev,
      targets: next,
      runMode:
        prev.runMode === "action" && next.length !== 1 ? "prompt" : prev.runMode,
    }));
  };

  // Mirrors the prompt for setPrompt to compare against. Written during render so
  // it is already current when the freshly mounted composer reports its seed.
  promptRef.current = draft.prompt;

  // The composer reports its value once on mount (the seed it was given) and
  // again whenever an image save starts or finishes — neither is a user edit, so
  // only a changed prompt marks the draft touched.
  const setPrompt = (value: ComposerValue) => {
    const prev = promptRef.current;
    promptRef.current = value;
    if (samePrompt(prev, value)) {
      if (prev.pending === value.pending) return;
    } else {
      setTouched(true);
    }
    setDraft((d) => ({ ...d, prompt: value }));
  };

  const isStandalone = !draft.everyProject && draft.targets.length === 0;
  const scheduleProblem = useMemo(() => validateDraftSchedule(draft), [draft]);
  const validationError = validateJobDraft(draft, isStandalone);
  // Saving mid-save would write a prompt whose image isn't on disk yet.
  const imagesPending = draft.prompt.pending;
  const canSave =
    validationError === null && !loading && !saving && !imagesPending;

  const save = async () => {
    if (!canSave) return;
    // The shared layer of a paired machine is written through it, by builds
    // that take that.
    if (machine.peer && !machine.peer.supportsHostJobs && (!runProject || source === "global")) {
      toast.error(
        `Update lpm on ${machine.peer.alias || machine.peer.host} to save an automation that runs in more than one of its projects, or in none.`,
      );
      return;
    }
    setSaving(true);
    try {
      await saveJobDraft(
        draft.runMode === "action" && !actionLaunchesAgent
          ? { ...draft, prompt: EMPTY_COMPOSER }
          : draft,
        editing ? { project: editing.project, id: editing.job.id, source } : null,
        knownIds?.(null) ?? [],
        machine.host,
      );
      toast.success(isEditing ? "Automation updated" : "Automation created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Could not update the automation"
            : "Could not create the automation",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setConfirmDelete(false);
    setSaving(true);
    try {
      if (source === "global") {
        await deleteJobGlobal(editing.job.id, machine.host);
        await clearJobStateGlobal(editing.job.id, deleteCopies, machine.host);
      } else {
        await deleteJob(editing.project, editing.job.id);
        await ClearJobState(editing.project, editing.job.id, deleteCopies);
      }
      toast.success("Automation deleted");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // A nested editor (an AI rewrite's variant) that claims ⌘↵ marks it handled.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || isImeComposing(e)) return;
    if (matchesChord(e, { key: "Enter", meta: true })) {
      e.preventDefault();
      void save();
    }
  };

  const { requestClose, guardOpen, dialog } = useDiscardGuard({
    open,
    entity: "automation",
    isDirty: () => touched,
    saving,
    onClose,
  });

  // Two scopes the picker can't rewrite: a repo job is declared by the project's
  // own checked-in config, which travels with that folder (moving it would mean
  // editing the repo, as its missing Delete already reflects), and an
  // every-project job's scope has no equivalent in a list of projects.
  const lockedScope = !isEditing
    ? undefined
    : source === "repo"
      ? displayNameForProjectName(editing.project, storeProjects)
      : draft.everyProject
        ? "Every project"
        : undefined;

  // What removal takes the job from, read off the saved job rather than the
  // draft — the scope on screen may not be the one being deleted.
  const removeScope = editing
    ? jobScopePhrase(editing.job, (name) =>
        displayNameForProjectName(name, storeProjects),
      )
    : "";

  // A job spanning projects is kept out of copies (it would fire on the very
  // copies its runs create), so name the ones the current scope quietly skips.
  const skippedCopies = useMemo(() => {
    if (runProject) return [];
    const present = new Set(storeProjects.map((p) => p.name));
    return storeProjects
      .filter(
        (p) =>
          (draft.everyProject ? machine.onHost(p.name) : draft.targets.includes(p.name)) &&
          isDuplicate(p, present),
      )
      .map((p) => displayNameForProjectName(p.name, storeProjects));
  }, [draft.everyProject, draft.targets, runProject, storeProjects, machine.onHost]);

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        closeOnEscape={!confirmDelete && !guardOpen && !checkAIOpen && !connecting}
        closeOnBackdrop={!confirmDelete && !guardOpen && !checkAIOpen && !connecting}
        backdropClassName="bg-black/50 backdrop-blur-sm"
        contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      >
        <div
          onKeyDown={onKeyDown}
          className="flex h-[min(900px,94vh)] w-[min(720px,calc(100vw-32px))] flex-col"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)]">
                <ClockIcon size={15} />
              </span>
              <h2 className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
                {isEditing ? "Edit automation" : "New automation"}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {!isEditing && (
                <VideoLink url={JOBS_VIDEO_URL} label="Video guide" length={JOBS_VIDEO_LENGTH} />
              )}
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <XIcon />
              </button>
            </div>
          </header>
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-[12px] text-[var(--text-muted)]">
              Loading job…
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-6">
              <div className="relative flex min-w-0 items-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 transition focus-within:border-[var(--accent-cyan)]/70">
                <EmojiSlotButton
                  inputRef={nameRef}
                  value={draft.emoji}
                  onSelect={(next) => set("emoji", next)}
                  size="md"
                  placeholder={<ClockIcon size={16} />}
                />
                <input
                  ref={nameRef}
                  value={draft.label}
                  onChange={(e) => set("label", e.target.value)}
                  placeholder="Name this automation"
                  className="min-w-0 flex-1 border-none bg-transparent py-3 pl-11 pr-4 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] outline-none placeholder:font-medium placeholder:text-[var(--text-muted)]"
                />
              </div>

              <div className="space-y-2">
                <RunKindPicker
                  value={draft.runMode}
                  onChange={(mode) => set("runMode", mode)}
                  actionsAvailable={actionsAvailable}
                />
                {draft.runMode === "prompt" && (
                  <InputComposer
                    key={composerSession}
                    defaultValue={draft.prompt}
                    onChange={setPrompt}
                    placeholder="Check for dependency updates. If there are none, stop. Otherwise duplicate this project with the lpm CLI, upgrade them in the copy, and run the tests."
                    history={composerHistory}
                    aiCwd={aiCwd}
                    memory={memoryFor(draft.agent || defaultAgent)}
                    footer={
                      <>
                        <span className="min-w-0 flex-1" />
                        <RowModelSelect
                          agent={draft.agent}
                          model={draft.model}
                          effort={draft.effort}
                          onChange={patch}
                        />
                      </>
                    }
                  />
                )}
                {draft.runMode === "cmd" && (
                  <input
                    value={draft.cmd}
                    onChange={(e) => set("cmd", e.target.value)}
                    placeholder="npm run refresh-fixtures"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="w-full rounded-xl border border-transparent bg-[var(--bg-secondary)]/40 px-4 py-3 font-mono text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]/60"
                  />
                )}
                {draft.runMode === "action" && actionsAvailable && (
                  <div className="rounded-xl bg-[var(--bg-secondary)]/40 px-4 py-3">
                    {actions.length > 0 ? (
                      <ActionPicker
                        actions={actions}
                        value={draft.action}
                        onChange={(name) => set("action", name)}
                        scope={runProject}
                      />
                    ) : (
                      <p className="text-[12px] text-[var(--text-muted)]">
                        This project has no actions yet. Pick a command or AI
                        prompt instead.
                      </p>
                    )}
                  </div>
                )}
                {draft.runMode === "action" && actionLaunchesAgent && (
                  <InputComposer
                    key={composerSession}
                    defaultValue={draft.prompt}
                    onChange={setPrompt}
                    placeholder={`What should ${selectedAction?.label || "the agent"} work on? Leave empty to just open it.`}
                    history={composerHistory}
                    aiCwd={aiCwd}
                    memory={memoryFor(actionAgent)}
                  />
                )}
                <JobScopeRow
                  host={machine.host ?? null}
                  draft={draft}
                  patch={patch}
                  onScope={setScope}
                  options={projects.filter(machine.onHost).map((p) => ({
                    value: p,
                    label: displayNameForProjectName(p, storeProjects),
                  }))}
                  machine={
                    machine.shown
                      ? {
                          value: machine.host ?? "",
                          options: machine.options,
                          // Its projects are that machine's, so they go with it.
                          onChange: (value) => {
                            machine.setHost(value || undefined);
                            setScope([]);
                          },
                        }
                      : undefined
                  }
                  lockedScope={lockedScope}
                  canDuplicate={canDuplicate}
                  skippedCopies={skippedCopies}
                  problem={isStandalone && draft.runMode === "action"}
                  onConnect={(service, intent) => setConnecting({ service, intent })}
                />
                <JobCheckField
                  key={`check-${composerSession}`}
                  value={draft.check}
                  project={runProject}
                  onChange={(check) => set("check", check)}
                  onGenerate={aiCwd ? () => setCheckAIOpen(true) : undefined}
                />
              </div>

              <JobFrequencyCard
                draft={draft}
                patch={patch}
                problem={scheduleProblem}
                ai={{ project: contextProject, cwd: aiCwd ?? "" }}
              />
            </div>
          )}

          <JobEditorFooter
            draft={draft}
            isEditing={isEditing}
            hint={touched && !loading ? validationError : null}
            saving={saving}
            imagesPending={imagesPending}
            canSave={canSave}
            onSave={() => void save()}
            onDelete={
              isEditing && source !== "repo"
                ? () => {
                    setDeleteCopies(false);
                    setConfirmDelete(true);
                  }
                : undefined
            }
          />
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete automation?"
        body={
          <>
            Remove{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {editing?.job.label || editing?.job.id}
            </span>
            {removeScope ? ` ${removeScope}` : ""}. This cannot be undone.
            {editing?.job.duplicate && (
              <label className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={deleteCopies}
                  onChange={(e) => setDeleteCopies(e.target.checked)}
                  className="accent-[var(--accent-blue)] h-3 w-3"
                />
                Also remove the copies its runs created
              </label>
            )}
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
      {aiCwd && (
        <CheckAIModal
          open={checkAIOpen}
          project={runProject}
          task={checkTask(draft, selectedAction)}
          aiProject={contextProject}
          aiCwd={aiCwd}
          onClose={() => setCheckAIOpen(false)}
          onUse={(check) => set("check", check)}
        />
      )}
      <SendToConnectModal
        destination={connecting?.service ?? null}
        host={machine.host ?? null}
        intent={connecting?.intent}
        onClose={() => setConnecting(null)}
        onAdded={(ids) => {
          // A chat added from this job is one it means to send to.
          if (connecting?.intent !== "add") return;
          setTouched(true);
          setDraft((d) => ({ ...d, sendTo: [...d.sendTo, ...ids.filter((id) => !d.sendTo.includes(id))] }));
        }}
      />
      {dialog}
    </>
  );
}
