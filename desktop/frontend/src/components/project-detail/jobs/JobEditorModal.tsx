import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "../../ui/Modal";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ActionPicker } from "../../ActionPicker";
import { InputComposer } from "../../InputComposer";
import { EmojiSlotButton } from "../../EmojiPickerButton";
import { displayNameForProjectName } from "../../ProjectNameDisplay";
import { ChevronDownIcon, ClockIcon, XIcon } from "../../icons";
import { RowSelect } from "./RowSelect";
import { RowMultiSelect } from "./RowMultiSelect";
import { JobFrequencyCard } from "./JobFrequencyCard";
import { Card, GroupLabel, Row } from "./JobFormRows";
import {
  ClearJobState,
  ClearJobStateGlobal,
  TestJobCheck,
} from "../../../../bridge/commands";
import {
  deleteJob,
  deleteJobGlobal,
  readJobPayloadFrom,
} from "../../../jobsConfig";
import { saveJobDraft, scopeProject } from "../../../jobsSave";
import {
  defaultJobDraft,
  describeDraftSchedule,
  jobScopePhrase,
  payloadToDraft,
  validateJobDraft,
  type JobDraft,
  type JobInfo,
  type JobRunKind,
  type DuplicateMode,
} from "../../../jobsFormat";
import { type ComposerValue } from "../../../composerValue";
import { isDuplicate, type ActionInfo } from "../../../types";
import { useAppStore } from "../../../store/app";
import { effortsFor, MODEL_OPTIONS } from "../../../agentModelOptions";

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
  onClose: () => void;
  onSaved: () => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "work"; output?: string }
  | { kind: "nowork"; output?: string }
  | { kind: "error"; message: string };

// The UI's repeat vocabulary, derived from (and written back to) the draft's
// schedule fields.
type Repeat = "daily" | "days" | "interval" | "manual";

const RUN_LABEL: Record<JobRunKind, string> = {
  prompt: "AI prompt",
  cmd: "Command",
  action: "Action",
};

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
  onClose,
  onSaved,
}: JobEditorModalProps) {
  const isEditing = editing !== null;
  const [draft, setDraft] = useState<JobDraft>(defaultJobDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCopies, setDeleteCopies] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  // The scope picker holds the projects the job runs in — for a new job and for
  // one being edited alike; empty = standalone. Exactly one project unlocks the
  // project-scoped features.
  const runProject = scopeProject(draft);
  // Actions belong to one project, so they need exactly one in scope.
  const actionsAvailable = runProject !== undefined;
  // A standalone job runs in the home folder, so there is no project to copy.
  const canDuplicate = draft.targets.length > 0 || draft.everyProject;
  const actions = actionsAvailable && runProject ? actionsFor(runProject) : [];
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

  useEffect(() => {
    if (!open) return;
    setTest({ kind: "idle" });
    setConfirmDelete(false);
    setSaving(false);
    setAdvancedOpen(false);
    setTouched(false);
    setComposerSession((n) => n + 1);
    if (!editing) {
      setDraft(defaultJobDraft());
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
        // A job that already gates on a check must not hide it behind the
        // collapsed disclosure.
        setAdvancedOpen(Boolean(next.check.trim()));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editing]);

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
    setTest({ kind: "idle" });
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
  const scheduleSummary = useMemo(() => describeDraftSchedule(draft), [draft]);
  const validationError = validateJobDraft(draft, isStandalone);
  // Saving mid-save would write a prompt whose image isn't on disk yet.
  const imagesPending = draft.prompt.pending;
  const canSave =
    validationError === null && !loading && !saving && !imagesPending;
  const canTest = actionsAvailable && !!runProject;

  const runCheckTest = async () => {
    if (!draft.check.trim() || !canTest || !runProject) return;
    setTest({ kind: "running" });
    try {
      const result = (await TestJobCheck(runProject, draft.check)) as {
        work?: boolean;
        output?: string | null;
      };
      setTest({
        kind: result.work ? "work" : "nowork",
        output: result.output ?? undefined,
      });
    } catch (err) {
      setTest({
        kind: "error",
        // Tauri rejects with a plain string, so `err instanceof Error` is false
        // and would swallow the message the backend wrote.
        message: String(err) || "The check couldn't run.",
      });
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveJobDraft(
        draft,
        editing ? { project: editing.project, id: editing.job.id, source } : null,
        knownIds?.(null) ?? [],
      );
      toast.success(isEditing ? "Job updated" : "Job created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Could not update the job"
            : "Could not create the job",
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
        await deleteJobGlobal(editing.job.id);
        await ClearJobStateGlobal(editing.job.id, deleteCopies);
      } else {
        await deleteJob(editing.project, editing.job.id);
        await ClearJobState(editing.project, editing.job.id, deleteCopies);
      }
      toast.success("Job deleted");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
          (draft.everyProject || draft.targets.includes(p.name)) &&
          isDuplicate(p, present),
      )
      .map((p) => displayNameForProjectName(p.name, storeProjects));
  }, [draft.everyProject, draft.targets, runProject, storeProjects]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        closeOnEscape={!confirmDelete}
        closeOnBackdrop={!confirmDelete}
        backdropClassName="bg-black/50 backdrop-blur-sm"
        contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      >
        <div className="flex max-h-[min(820px,92vh)] w-[min(640px,calc(100vw-32px))] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)]">
                <ClockIcon size={15} />
              </span>
              <h2 className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
                {isEditing ? "Edit job" : "New job"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <XIcon />
            </button>
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
                  placeholder="Name this job"
                  className="min-w-0 flex-1 border-none bg-transparent py-3 pl-11 pr-4 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] outline-none placeholder:font-medium placeholder:text-[var(--text-muted)]"
                />
              </div>

              {draft.runMode === "prompt" && (
                <InputComposer
                  key={composerSession}
                  defaultValue={draft.prompt}
                  onChange={setPrompt}
                  placeholder="Check for dependency updates. If there are none, stop. Otherwise duplicate this project with the lpm CLI, upgrade them in the copy, and run the tests."
                  history={composerHistory}
                  aiCwd={aiCwd}
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

              <div>
                <GroupLabel>Details</GroupLabel>
                <Card>
                  <Row label="Runs in">
                    {lockedScope ? (
                      <span className="text-[13px] text-[var(--text-secondary)]">
                        {lockedScope}
                      </span>
                    ) : (
                      <RowMultiSelect
                        value={draft.targets}
                        onChange={setScope}
                        options={projects.map((p) => ({
                          value: p,
                          label: displayNameForProjectName(p, storeProjects),
                        }))}
                      />
                    )}
                  </Row>
                  {canDuplicate && (
                    <Row label="Works on">
                      <RowSelect
                        value={draft.duplicateMode}
                        onChange={(mode) =>
                          set("duplicateMode", mode as DuplicateMode)
                        }
                        options={[
                          { value: "none", label: "The project itself" },
                          { value: "copy", label: "A fresh copy of it" },
                          { value: "worktree", label: "A Git worktree of it" },
                        ]}
                      />
                    </Row>
                  )}
                  <Row label="Does">
                    <RowSelect
                      value={draft.runMode}
                      onChange={(mode) => set("runMode", mode as JobRunKind)}
                      options={(actionsAvailable
                        ? (["prompt", "cmd", "action"] as JobRunKind[])
                        : (["prompt", "cmd"] as JobRunKind[])
                      ).map((k) => ({ value: k, label: RUN_LABEL[k] }))}
                    />
                  </Row>
                  {draft.runMode === "prompt" && (
                    <Row label="Model">
                      <RowSelect
                        value={`${draft.agent}|${draft.model}`}
                        onChange={(v) => {
                          const [agent, model] = v.split("|");
                          setTouched(true);
                          setDraft((prev) => {
                            const efforts = effortsFor(agent, model);
                            const effort = efforts.some((e) => e.value === prev.effort)
                              ? prev.effort
                              : "";
                            return { ...prev, agent, model, effort };
                          });
                        }}
                        options={MODEL_OPTIONS}
                      />
                    </Row>
                  )}
                  {draft.runMode === "prompt" && effortsFor(draft.agent, draft.model).length > 0 && (
                    <Row label="Effort">
                      <RowSelect
                        value={draft.effort}
                        onChange={(v) => set("effort", v)}
                        options={effortsFor(draft.agent, draft.model)}
                      />
                    </Row>
                  )}
                  {draft.runMode === "prompt" && (
                    <Row label="Access">
                      <RowSelect
                        value={draft.access}
                        onChange={(v) => set("access", v as "full" | "read")}
                        options={[
                          { value: "full", label: "Full access" },
                          { value: "read", label: "Read only" },
                        ]}
                      />
                    </Row>
                  )}
                  {draft.runMode === "action" && actionsAvailable && (
                    <div className="px-4 py-3">
                      {actions.length > 0 ? (
                        <ActionPicker
                          actions={actions}
                          value={draft.action}
                          onChange={(name) => set("action", name)}
                        />
                      ) : (
                        <p className="text-[12px] text-[var(--text-muted)]">
                          This project has no actions yet. Pick a command or AI
                          prompt instead.
                        </p>
                      )}
                    </div>
                  )}
                </Card>
                {skippedCopies.length > 0 && (
                  <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
                    A job that runs in more than one project skips copies — it
                    won't run in {listNames(skippedCopies)}.
                  </p>
                )}
                {canDuplicate && draft.duplicateMode !== "none" && (
                  <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
                    Each run works in a new{" "}
                    {draft.duplicateMode === "worktree" ? "worktree" : "copy"},
                    leaving the project untouched. The next run waits until
                    you've looked at the last one and removed it.
                  </p>
                )}
              </div>

              <JobFrequencyCard
                draft={draft}
                patch={patch}
                summary={scheduleSummary}
              />

              <div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                  className="flex items-center gap-1 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <span
                    className={`scale-75 transition-transform ${advancedOpen ? "" : "-rotate-90"}`}
                  >
                    <ChevronDownIcon />
                  </span>
                  Advanced
                </button>
                {advancedOpen && (
                  <div className="mt-3 field-reveal">
                    <GroupLabel>Only when there's work (optional)</GroupLabel>
                    <Card>
                  <div className="space-y-2 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={draft.check}
                        onChange={(e) => {
                          set("check", e.target.value);
                          setTest({ kind: "idle" });
                        }}
                        placeholder="git fetch && git log HEAD..@{u} --oneline | grep ."
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        className="min-w-0 flex-1 border-none bg-transparent font-mono text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                      />
                      <button
                        type="button"
                        onClick={() => void runCheckTest()}
                        disabled={
                          !draft.check.trim() || !canTest || test.kind === "running"
                        }
                        title={
                          canTest ? undefined : "Pick a project to test the check."
                        }
                        className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                      >
                        {test.kind === "running" ? "Testing…" : "Test"}
                      </button>
                    </div>
                    {test.kind === "work" && (
                      <p className="text-[12px] text-[var(--accent-cyan)]">
                        Would run — there's work to do.
                      </p>
                    )}
                    {test.kind === "nowork" && (
                      <p className="text-[12px] text-[var(--text-muted)]">
                        Nothing to do right now.
                      </p>
                    )}
                    {(test.kind === "work" || test.kind === "nowork") &&
                      test.output && (
                        <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-[var(--text-muted)]">
                          {test.output}
                        </pre>
                      )}
                    {test.kind === "error" && (
                      <p className="text-[12px] text-[var(--accent-red)]">
                        {test.message}
                      </p>
                    )}
                  </div>
                    </Card>
                    <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
                      A command that decides whether the job has anything to do —
                      it runs only when this succeeds. Leave blank to run every
                      time.
                    </p>
                    {draft.runMode !== "action" && (
                      <div className="mt-4">
                        <GroupLabel>Check the work afterwards (optional)</GroupLabel>
                        <Card>
                          <div className="px-4 py-3">
                            <input
                              value={draft.verify}
                              onChange={(e) => set("verify", e.target.value)}
                              placeholder="npm test"
                              spellCheck={false}
                              className="w-full border-none bg-transparent font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                            />
                          </div>
                        </Card>
                        <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
                          Runs where the job ran, once the run finishes. If it
                          fails, the run is reported as needing a look instead of
                          done. Leave blank and the run isn't checked.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {isEditing && source !== "repo" && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteCopies(false);
                    setConfirmDelete(true);
                  }}
                  disabled={saving}
                  className="shrink-0 rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--accent-red)] transition-colors hover:bg-[var(--accent-red)]/10 disabled:opacity-40"
                >
                  Delete
                </button>
              )}
              {touched && !loading && validationError && (
                <p className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">
                  {validationError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!canSave}
                className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
              >
                {imagesPending
                  ? "Attaching images…"
                  : saving
                    ? isEditing
                      ? "Saving…"
                      : "Creating…"
                    : isEditing
                      ? "Save changes"
                      : "Create job"}
              </button>
            </div>
          </footer>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete job?"
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
    </>
  );
}

// "Foo", "Foo and Bar", "Foo, Bar and 3 more".
function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}


