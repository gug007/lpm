import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "../../ui/Modal";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ActionPicker } from "../../ActionPicker";
import { EmojiSlotButton } from "../../EmojiPickerButton";
import { ChevronDownIcon, ClockIcon, XIcon } from "../../icons";
import { WeekdayPicker } from "./WeekdayPicker";
import { RowSelect } from "./RowSelect";
import {
  ClearJobState,
  ClearJobStateGlobal,
  TestJobCheck,
} from "../../../../bridge/commands";
import { slugify } from "../../../slugify";
import { uniqueKey } from "../../../uniqueKey";
import {
  deleteJob,
  deleteJobGlobal,
  readGlobalJobIds,
  readJobIds,
  readJobPayloadFrom,
  saveJob,
  saveJobGlobal,
} from "../../../jobsConfig";
import {
  buildJobPayload,
  defaultJobDraft,
  describeDraftSchedule,
  payloadToDraft,
  validateJobDraft,
  type IntervalUnit,
  type JobDraft,
  type JobInfo,
  type JobRunKind,
} from "../../../jobsFormat";
import { type ActionInfo } from "../../../types";
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
  | { kind: "work" }
  | { kind: "nowork" }
  | { kind: "error"; message: string };

// The UI's repeat vocabulary, derived from (and written back to) the draft's
// schedule fields.
type Repeat = "daily" | "days" | "interval";

const RUN_LABEL: Record<JobRunKind, string> = {
  prompt: "AI prompt",
  cmd: "Command",
  action: "Action",
};

// "" = every project (the global config layer).
const ALL_PROJECTS = "";

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
  const [target, setTarget] = useState<string>(ALL_PROJECTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Whether the user has edited anything yet — the "what's missing" hint
  // stays quiet on a freshly opened editor.
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const source = editing?.job.source ?? "project";
  const isGlobalTarget = isEditing ? source === "global" : target === ALL_PROJECTS;
  const runProject = isEditing ? editing.project : target;
  const actions = isGlobalTarget ? [] : actionsFor(runProject);

  useEffect(() => {
    if (!open) return;
    setTest({ kind: "idle" });
    setConfirmDelete(false);
    setSaving(false);
    setTarget(ALL_PROJECTS);
    setAdvancedOpen(false);
    setTouched(false);
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
        setDraft(next);
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

  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => {
    setTouched(true);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const repeat: Repeat =
    draft.scheduleMode === "interval"
      ? "interval"
      : draft.days.length > 0
        ? "days"
        : "daily";

  const setRepeat = (next: Repeat) => {
    if (next === "interval") {
      set("scheduleMode", "interval");
    } else {
      setTouched(true);
      setDraft((prev) => ({
        ...prev,
        scheduleMode: "time",
        days: next === "daily" ? [] : prev.days.length > 0 ? prev.days : ["mon"],
      }));
    }
  };

  const scheduleSummary = useMemo(() => describeDraftSchedule(draft), [draft]);
  const validationError = validateJobDraft(draft);
  const canSave = validationError === null && !loading && !saving;
  const canTest = !isGlobalTarget && !!runProject;

  const runCheckTest = async () => {
    if (!draft.check.trim() || !canTest) return;
    setTest({ kind: "running" });
    try {
      const result = (await TestJobCheck(runProject, draft.check)) as {
        work?: boolean;
      };
      setTest({ kind: result.work ? "work" : "nowork" });
    } catch (err) {
      setTest({
        kind: "error",
        message: err instanceof Error ? err.message : "The check couldn't run.",
      });
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = buildJobPayload(draft);
      let id = editing?.job.id;
      if (!id) {
        const layerIds = isGlobalTarget
          ? await readGlobalJobIds()
          : await readJobIds(target);
        const visibleIds = knownIds?.(isGlobalTarget ? null : target) ?? [];
        id = uniqueKey(slugify(draft.label) || "job", [
          ...layerIds,
          ...visibleIds,
        ]);
      }
      if (isGlobalTarget) await saveJobGlobal(id, payload);
      else await saveJob(isEditing ? editing.project : target, id, payload);
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
        await ClearJobStateGlobal(editing.job.id, false);
      } else {
        await deleteJob(editing.project, editing.job.id);
        await ClearJobState(editing.project, editing.job.id, false);
      }
      toast.success("Job deleted");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the job");
    } finally {
      setSaving(false);
    }
  };

  const whereValue = isEditing
    ? source === "global"
      ? "Every project"
      : editing.project
    : undefined;

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
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-[12px] text-[var(--text-muted)]">
              Loading job…
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-6">
              <div className="relative flex items-center gap-2">
                <EmojiSlotButton
                  inputRef={nameRef}
                  value={draft.emoji}
                  onSelect={(next) => set("emoji", next)}
                  size="md"
                  placeholder={<ClockIcon size={15} />}
                />
                <input
                  ref={nameRef}
                  value={draft.label}
                  onChange={(e) => set("label", e.target.value)}
                  placeholder="Name this job"
                  className="min-w-0 flex-1 border-none bg-transparent pl-10 text-[20px] font-semibold tracking-tight text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <XIcon />
                </button>
              </div>

              {draft.runMode === "prompt" && (
                <textarea
                  value={draft.prompt}
                  onChange={(e) => set("prompt", e.target.value)}
                  placeholder="Check for dependency updates. If there are none, stop. Otherwise duplicate this project with the lpm CLI, upgrade them in the copy, and run the tests."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-4 py-3.5 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
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
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-4 py-3.5 font-mono text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
                />
              )}

              <div>
                <GroupLabel>Details</GroupLabel>
                <Card>
                  <Row label="Runs in">
                    {whereValue ? (
                      <span className="text-[13px] text-[var(--text-secondary)]">
                        {whereValue}
                      </span>
                    ) : (
                      <RowSelect
                        value={target}
                        onChange={(next) => {
                          setTarget(next);
                          setTest({ kind: "idle" });
                          if (next === ALL_PROJECTS && draft.runMode === "action") {
                            set("runMode", "prompt");
                          }
                        }}
                        options={[
                          { value: ALL_PROJECTS, label: "Every project" },
                          ...projects.map((p) => ({ value: p, label: p })),
                        ]}
                      />
                    )}
                  </Row>
                  <Row label="Does">
                    <RowSelect
                      value={draft.runMode}
                      onChange={(mode) => set("runMode", mode as JobRunKind)}
                      options={(isGlobalTarget
                        ? (["prompt", "cmd"] as JobRunKind[])
                        : (["prompt", "cmd", "action"] as JobRunKind[])
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
                            const efforts = effortsFor(agent);
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
                  {draft.runMode === "prompt" && effortsFor(draft.agent).length > 0 && (
                    <Row label="Effort">
                      <RowSelect
                        value={draft.effort}
                        onChange={(v) => set("effort", v)}
                        options={effortsFor(draft.agent)}
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
                  {draft.runMode === "action" && !isGlobalTarget && (
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
              </div>

              <div>
                <GroupLabel>Frequency</GroupLabel>
                <Card>
                  <Row label="Repeat">
                    <RowSelect
                      value={repeat}
                      onChange={(v) => setRepeat(v as Repeat)}
                      options={[
                        { value: "daily", label: "Every day" },
                        { value: "days", label: "On certain days" },
                        { value: "interval", label: "On an interval" },
                      ]}
                    />
                  </Row>
                  {repeat === "days" && (
                    <Row label="On" alignTop>
                      <WeekdayPicker
                        value={draft.days}
                        onChange={(days) => set("days", days)}
                      />
                    </Row>
                  )}
                  {repeat === "interval" ? (
                    <Row label="Every">
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={draft.intervalValue}
                          onChange={(e) =>
                            set(
                              "intervalValue",
                              Math.max(1, Math.floor(Number(e.target.value) || 1)),
                            )
                          }
                          className="w-12 border-none bg-transparent text-right text-[13px] text-[var(--text-secondary)] outline-none transition-colors hover:text-[var(--text-primary)] focus:text-[var(--text-primary)]"
                        />
                        <RowSelect
                          value={draft.intervalUnit}
                          onChange={(u) => set("intervalUnit", u as IntervalUnit)}
                          options={[
                            { value: "hours", label: "hours" },
                            { value: "days", label: "days" },
                          ]}
                        />
                      </span>
                    </Row>
                  ) : (
                    <Row label="At">
                      <input
                        type="time"
                        value={draft.time}
                        onChange={(e) => set("time", e.target.value)}
                        className="border-none bg-transparent text-right text-[13px] text-[var(--text-secondary)] outline-none transition-colors hover:text-[var(--text-primary)] focus:text-[var(--text-primary)]"
                      />
                    </Row>
                  )}
                </Card>
                {scheduleSummary && (
                  <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                    {scheduleSummary}.
                  </p>
                )}
              </div>

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
                  onClick={() => setConfirmDelete(true)}
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
                {saving
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
            </span>{" "}
            from {source === "global" ? "every project" : "this project"}. This
            cannot be undone.
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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[12px] font-medium text-[var(--text-muted)]">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
      {children}
    </div>
  );
}

function Row({
  label,
  alignTop,
  children,
}: {
  label: string;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex ${alignTop ? "items-start" : "items-center"} justify-between gap-4 px-4 py-3`}
    >
      <span className="shrink-0 text-[13px] text-[var(--text-primary)]">
        {label}
      </span>
      {children}
    </div>
  );
}

