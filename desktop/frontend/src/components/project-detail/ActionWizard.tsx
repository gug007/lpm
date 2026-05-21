import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import YAML from "yaml";
import { toast } from "sonner";
import { appendAction, replaceAction, replaceActionPayload, type ActionPatch } from "../../actionConfig";
import { MonacoEditor } from "../MonacoEditor";
import { slugify } from "../../slugify";
import { uniqueKey } from "../../uniqueKey";
import type { ActionInfo } from "../../types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  HelpCircleIcon,
  PlayIcon,
  PlusIcon,
  SparkleIcon,
  TerminalIcon,
  TrashIcon,
  XIcon,
  ZapIcon,
} from "../icons";
import { Modal } from "../ui/Modal";
import { TrafficLights } from "../ui/TrafficLights";
import { useOutsideClick } from "../../hooks/useOutsideClick";

type Shape = "button" | "split" | "dropdown";
type RunMode = "once" | "terminal" | "background";

const SHAPE_PREVIEW_BUTTON_CLASS =
  "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]";

const TERMINAL_KEYWORDS = /\b(tail|watch|log|logs|shell|console|server)\b/;
const BACKGROUND_KEYWORDS = /\b(fetch|pull|build|install|compile|generate)\b/;
const CONFIRM_KEYWORDS = /\b(deploy|migrate|reset|drop|delete|destroy|remove|kill|prune)\b/i;

const NEW_ACTION_KEY = "new-action";
const PLACEHOLDER_LABEL = "New action";

const SHAPE_OPTIONS: Array<{
  shape: Shape;
  title: string;
  description: string;
  badge?: string;
}> = [
  { shape: "button", title: "Button", description: "One click runs one command.", badge: "Recommended" },
  { shape: "split", title: "Split button", description: "A main command plus a small menu." },
  { shape: "dropdown", title: "Dropdown menu", description: "Just a menu of related commands." },
];

interface ChildDraft {
  id: string;
  label: string;
  cmd: string;
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
}

interface ActionWizardProps {
  open: boolean;
  projectName: string;
  // When set, the wizard runs in edit mode: prefill from this action and
  // submit a patch to its YAML key instead of appending a new entry.
  editing?: ActionInfo | null;
  // Create-only: collision avoidance for the new YAML key.
  existingActionKeys?: string[];
  // Create-only: position assigned to the new entry.
  nextPosition?: number;
  onClose: () => void;
  onSaved: () => void;
}

function newChild(): ChildDraft {
  return { id: crypto.randomUUID(), label: "", cmd: "", runMode: "once", reuse: false, confirm: false };
}

function inferRunMode(text: string): RunMode {
  const value = text.toLowerCase();
  if (TERMINAL_KEYWORDS.test(value)) return "terminal";
  if (BACKGROUND_KEYWORDS.test(value)) return "background";
  return "once";
}

function shouldConfirm(text: string): boolean {
  return CONFIRM_KEYWORDS.test(text);
}

// Auto-suggests run mode and confirm flag from the action's text. Run mode is
// only inferred while still on its default ("once"); confirm is sticky once on.
function applyAutoSettings(prev: FormDraft, nextName: string, nextCmd: string): Partial<FormDraft> {
  const text = `${nextName} ${nextCmd}`;
  const patch: Partial<FormDraft> = {};
  if (prev.runMode === "once") patch.runMode = inferRunMode(text);
  if (!prev.confirm && shouldConfirm(text)) patch.confirm = true;
  return patch;
}

function runModeHint(mode: RunMode, reuse: boolean) {
  if (mode === "terminal") {
    return reuse
      ? "Runs in a terminal. Running this action again reuses the same pane."
      : "Opens a new terminal every time this action runs.";
  }
  if (mode === "background") return "Runs in the background and shows a success notification when done.";
  return "Runs once and displays the result in a modal.";
}

function wizardCopy(editing: boolean): { title: string; hint: string; primary: string } {
  if (editing) {
    return {
      title: "Edit action",
      hint: "Update how this header action behaves.",
      primary: "Save changes",
    };
  }
  return {
    title: "Add a header action",
    hint: "Pick a name, choose how it shows, and set the command to run.",
    primary: "Create action",
  };
}

// Returns the first missing-field message, or null when the form is valid.
function getMissingHint(draft: FormDraft, hasMenuOption: boolean): string | null {
  const nameFilled = Boolean(draft.name.trim());
  const cmdFilled = Boolean(draft.cmd.trim());
  if (!nameFilled) return "Name is required";
  if (draft.shape === "button") return cmdFilled ? null : "Command is required";
  if (draft.shape === "split") {
    if (!cmdFilled) return "Default command is required";
    if (!hasMenuOption) return "Add at least one menu option";
    return null;
  }
  return hasMenuOption ? null : "Add at least one menu option";
}

interface FormDraft {
  shape: Shape;
  name: string;
  cmd: string;
  children: ChildDraft[];
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
}

function buildChildMap(children: ChildDraft[]): Record<string, unknown> {
  const childMap: Record<string, unknown> = {};
  const used: string[] = [];
  children
    .filter((child) => child.cmd.trim())
    .forEach((child, index) => {
      const key = uniqueKey(slugify(child.label) || `option-${index + 1}`, used);
      used.push(key);
      const childPayload: Record<string, unknown> = {
        label: child.label.trim() || key,
        cmd: child.cmd.trim(),
        position: index + 1,
      };
      if (child.runMode !== "once") childPayload.type = child.runMode;
      if (child.runMode === "terminal" && child.reuse) childPayload.reuse = true;
      if (child.confirm) childPayload.confirm = true;
      childMap[key] = childPayload;
    });
  return childMap;
}

// Returns set/remove for the wizard-managed fields. On edit, applying this
// patch leaves user-authored fields like cwd/env/inputs untouched.
function buildActionPatch({ shape, name, cmd, children, runMode, reuse, confirm }: FormDraft): ActionPatch {
  const set: Record<string, unknown> = { label: name.trim() };
  const remove: string[] = [];

  if (shape === "dropdown") {
    remove.push("cmd", "type", "reuse", "confirm");
  } else {
    set.cmd = cmd.trim();
    if (runMode !== "once") set.type = runMode;
    else remove.push("type");
    if (runMode === "terminal" && reuse) set.reuse = true;
    else remove.push("reuse");
    if (confirm) set.confirm = true;
    else remove.push("confirm");
  }

  if (shape === "button") remove.push("actions");
  else set.actions = buildChildMap(children);

  return { set, remove };
}

function buildCreatePayload(draft: FormDraft, position: number): Record<string, unknown> {
  const { set } = buildActionPatch(draft);
  return { ...set, display: "header", position };
}

type Submission =
  | { kind: "create"; key: string; payload: Record<string, unknown> }
  | { kind: "edit"; key: string; payload: Record<string, unknown>; patch: ActionPatch };

function buildSubmission(
  draft: FormDraft,
  context: { editing: ActionInfo | null | undefined; existingActionKeys: string[]; nextPosition: number },
): Submission {
  if (context.editing) {
    const patch = buildActionPatch(draft);
    return { kind: "edit", key: context.editing.name, payload: patch.set, patch };
  }
  return {
    kind: "create",
    key: uniqueKey(slugify(draft.name) || NEW_ACTION_KEY, context.existingActionKeys),
    payload: buildCreatePayload(draft, context.nextPosition),
  };
}

function inferShape(action: ActionInfo): Shape {
  const hasChildren = (action.children?.length ?? 0) > 0;
  const hasCmd = Boolean(action.cmd);
  if (hasChildren && hasCmd) return "split";
  if (hasChildren) return "dropdown";
  return "button";
}

function toRunMode(type: string | undefined): RunMode {
  return type === "terminal" || type === "background" ? type : "once";
}

function actionToDraft(action: ActionInfo): FormDraft {
  const children: ChildDraft[] = (action.children ?? []).map((c) => ({
    id: crypto.randomUUID(),
    label: c.label,
    cmd: c.cmd,
    runMode: toRunMode(c.type),
    reuse: c.reuse ?? false,
    confirm: c.confirm,
  }));
  return {
    shape: inferShape(action),
    name: action.label,
    cmd: action.cmd,
    children: children.length ? children : [newChild()],
    runMode: toRunMode(action.type),
    reuse: action.reuse ?? false,
    confirm: action.confirm,
  };
}

function defaultDraft(): FormDraft {
  return {
    shape: "button",
    name: "",
    cmd: "",
    children: [newChild()],
    runMode: "once",
    reuse: false,
    confirm: false,
  };
}

export function ActionWizard({
  open,
  projectName,
  editing,
  existingActionKeys = [],
  nextPosition = 1,
  onClose,
  onSaved,
}: ActionWizardProps) {
  const isEditing = Boolean(editing);
  const [draft, setDraft] = useState<FormDraft>(defaultDraft);
  const [showYaml, setShowYaml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"form" | "editor">("form");
  const [editorContent, setEditorContent] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSeed, setEditorSeed] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(editing ? actionToDraft(editing) : defaultDraft());
    setShowYaml(false);
    setSaving(false);
    setMode("form");
    setEditorError(null);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, editing]);

  const { shape, name, cmd, children, runMode, reuse, confirm } = draft;
  const nameFilled = Boolean(name.trim());
  const cmdFilled = Boolean(cmd.trim());
  const hasMenuOption = children.some((child) => child.cmd.trim());
  const showShape = nameFilled;
  const showCommand = nameFilled && shape !== "dropdown";
  const showRunMode = showCommand && cmdFilled;
  const showMenuOptions = nameFilled && (shape === "dropdown" || (shape === "split" && cmdFilled));
  const missingHint = getMissingHint(draft, hasMenuOption);
  const formIsValid = missingHint === null;
  const actionLabel = name.trim() || PLACEHOLDER_LABEL;
  const { title, hint, primary: primaryLabel } = wizardCopy(isEditing);
  const savingLabel = isEditing ? "Saving..." : "Creating...";

  const updateField = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const updateName = (value: string) =>
    setDraft((prev) => ({ ...prev, name: value, ...applyAutoSettings(prev, value, prev.cmd) }));

  const updateCmd = (value: string) =>
    setDraft((prev) => ({ ...prev, cmd: value, ...applyAutoSettings(prev, prev.name, value) }));

  const submit = async () => {
    if (saving) return;
    if (mode === "editor") {
      await submitFromEditor();
      return;
    }
    if (!formIsValid) return;
    setSaving(true);
    try {
      const submission = buildSubmission(draft, { editing, existingActionKeys, nextPosition });
      if (submission.kind === "edit") {
        await replaceAction(projectName, submission.key, submission.patch);
        toast.success("Action updated");
      } else {
        await appendAction(projectName, submission.key, submission.payload);
        toast.success("Action created");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fallback = isEditing ? "Could not update action" : "Could not create action";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const submitFromEditor = async () => {
    let parsed: unknown;
    try {
      parsed = YAML.parse(editorContent);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Invalid YAML");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setEditorError("YAML must be a mapping of action fields");
      return;
    }
    const payload = parsed as Record<string, unknown>;
    setEditorError(null);
    setSaving(true);
    try {
      if (editing) {
        await replaceActionPayload(projectName, editing.name, payload);
        toast.success("Action updated");
      } else {
        const key = uniqueKey(slugify(String(payload.label ?? "")) || NEW_ACTION_KEY, existingActionKeys);
        const withPosition = { display: "header", position: nextPosition, ...payload };
        await appendAction(projectName, key, withPosition);
        toast.success("Action created");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fallback = isEditing ? "Could not update action" : "Could not create action";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const switchToEditor = () => {
    const submission = buildSubmission(draft, { editing, existingActionKeys, nextPosition });
    setEditorContent(YAML.stringify(submission.payload, { lineWidth: 0 }));
    setEditorError(null);
    setEditorSeed((n) => n + 1);
    setMode("editor");
  };

  const switchToForm = () => {
    setEditorError(null);
    setMode("form");
  };

  const handleNameEnter = () => {
    if (showCommand) commandRef.current?.focus();
    else if (formIsValid) void submit();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex max-h-[88vh] w-[min(960px,calc(100vw-32px))] flex-col" onKeyDown={onKeyDown}>
        <header className="flex items-start justify-between gap-4 px-8 pb-6 pt-7">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">{title}</h2>
            <p className="mt-2 max-w-[520px] text-[13px] leading-5 text-[var(--text-secondary)]">{hint}</p>
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle mode={mode} onForm={switchToForm} onEditor={switchToEditor} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-2 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <XIcon />
            </button>
          </div>
        </header>

        {mode === "editor" ? (
          <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] px-8 py-6">
            <div className="min-h-[420px] flex-1 overflow-hidden rounded-xl border border-[var(--border)]">
              <MonacoEditor
                key={`action-editor-${editing?.name ?? "new"}-${editorSeed}`}
                value={editorContent}
                onChange={setEditorContent}
                language="yaml"
                modelUri={`inmemory://action-${editing?.name ?? "new"}-${editorSeed}.yaml`}
                onSave={() => void submit()}
              />
            </div>
            {editorError && (
              <p className="mt-3 text-[12px] text-[var(--text-error,#e15252)]">{editorError}</p>
            )}
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] lg:flex-row">
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-8 py-7">
            <FieldSection label="Button name">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => updateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  handleNameEnter();
                }}
                placeholder="Run tests"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3.5 text-[15px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]"
              />
            </FieldSection>

            {showShape && (
              <Reveal>
                <FieldSection label="How should it appear?">
                  <div className="space-y-1.5">
                    {SHAPE_OPTIONS.map((option) => (
                      <ShapeChoice
                        key={option.shape}
                        active={shape === option.shape}
                        shape={option.shape}
                        title={option.title}
                        badge={option.badge}
                        description={option.description}
                        previewLabel={actionLabel}
                        onClick={() => updateField("shape", option.shape)}
                      />
                    ))}
                  </div>
                </FieldSection>
              </Reveal>
            )}

            {showCommand && (
              <Reveal>
                <CommandField
                  inputRef={commandRef}
                  label={shape === "split" ? "Default command" : "Command"}
                  value={cmd}
                  onChange={updateCmd}
                  onEnter={() => void submit()}
                  placeholder={shape === "split" ? "npm run deploy:staging" : "npm run dev"}
                />
              </Reveal>
            )}

            {showRunMode && (
              <Reveal>
                <div className="space-y-7">
                  <RunModePicker
                    runMode={runMode}
                    reuse={reuse}
                    onRunMode={(mode) => updateField("runMode", mode)}
                    onReuse={(value) => updateField("reuse", value)}
                  />
                  <ConfirmPicker
                    confirm={confirm}
                    onConfirm={(value) => updateField("confirm", value)}
                  />
                </div>
              </Reveal>
            )}

            {showMenuOptions && (
              <Reveal>
                <MenuOptionsEditor
                  options={children}
                  onChange={(options) => updateField("children", options)}
                />
              </Reveal>
            )}

            {formIsValid && (
              <Reveal>
                <YamlPreview
                  expanded={showYaml}
                  onToggle={() => setShowYaml((value) => !value)}
                  submission={buildSubmission(draft, { editing, existingActionKeys, nextPosition })}
                />
              </Reveal>
            )}
          </div>

          <ActionPreviewPanel
            name={name}
            shape={shape}
            options={children}
            runMode={runMode}
            confirm={confirm}
            cmd={cmd}
          />
        </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-8 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {mode === "form" && missingHint && (
              <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">{missingHint}</span>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || (mode === "form" && !formIsValid)}
              className="rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-[13px] font-semibold text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? savingLabel : primaryLabel}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function ModeToggle({
  mode,
  onForm,
  onEditor,
}: {
  mode: "form" | "editor";
  onForm: () => void;
  onEditor: () => void;
}) {
  const base =
    "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors";
  const active = "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm";
  const inactive = "text-[var(--text-muted)] hover:text-[var(--text-primary)]";
  return (
    <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
      <button
        type="button"
        onClick={onForm}
        className={`${base} ${mode === "form" ? active : inactive}`}
      >
        Form
      </button>
      <button
        type="button"
        onClick={onEditor}
        className={`${base} ${mode === "editor" ? active : inactive}`}
      >
        Editor
      </button>
    </div>
  );
}

function FieldSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
      {children}
    </div>
  );
}

// Animates children in on mount. Used to fade-and-slide newly revealed
// form sections as the user fills the wizard.
function Reveal({ children }: { children: ReactNode }) {
  return <div className="field-reveal">{children}</div>;
}

function YamlPreview({
  expanded,
  onToggle,
  submission,
}: {
  expanded: boolean;
  onToggle: () => void;
  submission: Submission;
}) {
  return (
    <div className="border-t border-[var(--border)] pt-5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        {expanded ? "Hide config" : "Show config"}
      </button>
      {expanded && (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {YAML.stringify({ actions: { [submission.key]: submission.payload } }, { lineWidth: 0 })}
        </pre>
      )}
    </div>
  );
}

type DemoState = RunMode | "confirm" | null;

function ActionPreviewPanel({
  name,
  shape,
  options,
  runMode,
  confirm,
  cmd,
}: {
  name: string;
  shape: Shape;
  options: ChildDraft[];
  runMode: RunMode;
  confirm: boolean;
  cmd: string;
}) {
  const displayLabel = name.trim();
  const hasName = displayLabel.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState<DemoState>(null);
  const menuRef = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false), menuOpen);
  const visibleOptions = options.filter((option) => option.label.trim() || option.cmd.trim());
  const canRun = shape !== "dropdown" && cmd.trim().length > 0;

  useEffect(() => {
    setRunning(canRun ? runMode : null);
  }, [runMode, canRun]);

  const triggerRun = () => {
    if (!canRun) return;
    setRunning(confirm ? "confirm" : runMode);
  };

  const handleConfirm = () => setRunning(runMode);
  const handleCancel = () => setRunning(null);

  const dropdown = menuOpen && (
    <div className="absolute right-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl">
      {visibleOptions.length === 0 ? (
        <div className="px-4 py-2 text-[12px] italic text-[var(--text-muted)]">
          Add menu options to fill this menu.
        </div>
      ) : (
        visibleOptions.map((option, index) => (
          <div
            key={option.id}
            className="flex items-center gap-2.5 px-4 py-2 text-[12px] text-[var(--text-secondary)]"
          >
            <span className="flex-1 truncate">
              {option.label.trim() || `Option ${index + 1}`}
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <aside className="flex border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-7 lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="flex min-h-[140px] flex-1 flex-col lg:min-h-0">
        <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Preview
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          {!hasName ? (
            <div className="h-7 w-24 rounded-md border border-dashed border-[var(--border)]" />
          ) : shape === "button" ? (
            <button
              type="button"
              onClick={triggerRun}
              className={`inline-flex whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] ${SHAPE_PREVIEW_BUTTON_CLASS}`}
            >
              {displayLabel}
            </button>
          ) : shape === "split" ? (
            <div ref={menuRef} className="relative">
              <span className={`inline-flex items-stretch rounded-lg border text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}>
                <button
                  type="button"
                  onClick={triggerRun}
                  className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {displayLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`flex items-center rounded-r-lg border-l border-[var(--border)] px-1.5 transition-colors hover:bg-[var(--bg-hover)] ${menuOpen ? "bg-[var(--bg-hover)]" : ""}`}
                >
                  <ChevronDownIcon />
                </button>
              </span>
              {dropdown}
            </div>
          ) : (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] ${SHAPE_PREVIEW_BUTTON_CLASS} ${menuOpen ? "bg-[var(--bg-hover)]" : ""}`}
              >
                {displayLabel}
                <ChevronDownIcon />
              </button>
              {dropdown}
            </div>
          )}

          {canRun && (
            <RunModeDemo
              key={running ?? "idle"}
              running={running}
              cmd={cmd}
              label={displayLabel}
              onTrigger={triggerRun}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function MockModalShell({ width, children }: { width: number; children: ReactNode }) {
  return (
    <>
      <div className="demo-dim absolute inset-0 bg-black/45" />
      <div
        className="demo-modal absolute left-1/2 top-1/2 overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg"
        style={{ width }}
      >
        {children}
      </div>
    </>
  );
}

function RunModeDemo({
  running,
  cmd,
  label,
  onTrigger,
  onConfirm,
  onCancel,
}: {
  running: DemoState;
  cmd: string;
  label: string;
  onTrigger: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="relative w-full max-w-[240px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-md">
      <div className="flex h-[14px] items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2">
        <TrafficLights size="sm" />
      </div>

      <div className="flex h-[140px]">
        <div className="flex w-[36px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--bg-secondary)] p-1.5">
          <div className="h-1.5 rounded bg-[var(--border)]" />
          <div className="h-1.5 rounded bg-[var(--border)]" />
          <div className="h-1.5 w-2/3 rounded bg-[var(--border)] opacity-70" />
        </div>

        <div className="relative flex flex-1 flex-col overflow-hidden">
          <div className="flex h-[16px] items-center justify-end border-b border-[var(--border)] px-1.5">
            <button
              type="button"
              onClick={onTrigger}
              className="max-w-[80px] truncate rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-[1px] text-[7px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              {label}
            </button>
          </div>

          <div className="relative flex-1 overflow-hidden p-2">
            <div className="space-y-1">
              <div className="h-[3px] w-3/4 rounded bg-[var(--border)] opacity-70" />
              <div className="h-[3px] w-1/2 rounded bg-[var(--border)] opacity-70" />
              <div className="h-[3px] w-2/3 rounded bg-[var(--border)] opacity-70" />
              <div className="h-[3px] w-1/3 rounded bg-[var(--border)] opacity-70" />
            </div>

            {running === "confirm" && (
              <MockModalShell width={140}>
                <div className="space-y-1 px-2 py-1.5">
                  <div className="text-[8px] font-medium text-[var(--text-primary)]">Run {label}?</div>
                  <div className="truncate font-mono text-[7px] text-[var(--text-muted)]">$ {cmd}</div>
                </div>
                <div className="flex justify-end gap-1 border-t border-[var(--border)] px-1.5 py-1">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded px-1.5 py-[1px] text-[7px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirm}
                    className="rounded bg-[var(--text-primary)] px-1.5 py-[1px] text-[7px] font-medium text-[var(--bg-primary)]"
                  >
                    Run
                  </button>
                </div>
              </MockModalShell>
            )}

            {running === "once" && (
              <MockModalShell width={124}>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-1.5 py-1">
                  <span className="truncate text-[7px] font-medium text-[var(--text-primary)]">{label}</span>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded text-[7px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-0.5 px-1.5 py-1 font-mono text-[6px] leading-tight">
                  <div className="truncate text-[var(--text-primary)]">$ {cmd}</div>
                  <div className="text-[var(--text-muted)]">output…</div>
                </div>
              </MockModalShell>
            )}

            {running === "terminal" && (
              <div className="demo-terminal absolute inset-0 bg-black p-1.5 font-mono text-[7px] leading-tight text-white/90">
                <div className="truncate">$ {cmd}</div>
                <span className="demo-cursor mt-0.5 inline-block h-[6px] w-[3px] bg-white/80" />
              </div>
            )}

            {running === "background" && (
              <div className="demo-toast absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-1 shadow">
                <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--text-secondary)]" />
                <span className="max-w-[90px] truncate text-[7px] text-[var(--text-secondary)]">{label} running…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShapeChoice({
  active,
  shape,
  title,
  badge,
  description,
  previewLabel,
  onClick,
}: {
  active: boolean;
  shape: Shape;
  title: string;
  badge?: string;
  description: string;
  previewLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition ${
        active
          ? "border-[var(--text-primary)] bg-[var(--bg-primary)]"
          : "border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--text-muted)]"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          active
            ? "border-[var(--text-primary)] bg-[var(--text-primary)]"
            : "border-[var(--border)] group-hover:border-[var(--text-muted)]"
        }`}
      >
        {active && <span className="h-1 w-1 rounded-full bg-[var(--bg-primary)]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
          {badge && (
            <span className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              {badge}
            </span>
          )}
          <span className="truncate text-[12px] text-[var(--text-secondary)]">{description}</span>
        </span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <ShapePreviewButton shape={shape} label={previewLabel} />
      </span>
    </button>
  );
}

function ShapePreviewButton({ shape, label }: { shape: Shape; label: string }) {
  if (shape === "button") {
    return (
      <span
        className={`inline-flex whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}
      >
        {label}
      </span>
    );
  }

  if (shape === "split") {
    return (
      <span className={`inline-flex items-stretch rounded-lg border text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}>
        <span className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5">{label}</span>
        <span className="flex items-center rounded-r-lg border-l border-[var(--border)] px-1.5">
          <ChevronDownIcon />
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}
    >
      {label}
      <ChevronDownIcon />
    </span>
  );
}

function CommandField({
  inputRef,
  label,
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!onEnter || e.key !== "Enter") return;
          e.preventDefault();
          onEnter();
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 font-mono text-[13px] text-[var(--text-primary)] outline-none transition placeholder:font-sans placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)]"
      />
    </label>
  );
}

function MenuOptionsEditor({
  options,
  onChange,
}: {
  options: ChildDraft[];
  onChange: (options: ChildDraft[]) => void;
}) {
  const updateChild = (id: string, patch: Partial<ChildDraft>) =>
    onChange(options.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const updateField = (child: ChildDraft, field: "label" | "cmd", value: string) => {
    const text = field === "label" ? `${value} ${child.cmd}` : `${child.label} ${value}`;
    updateChild(child.id, {
      [field]: value,
      runMode: child.runMode === "once" ? inferRunMode(text) : child.runMode,
      confirm: child.confirm || shouldConfirm(text),
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-[13px] font-medium text-[var(--text-primary)]">Menu options</div>
      {options.map((child, index) => (
        <div key={child.id} className="space-y-4">
          <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(140px,1.4fr)_auto] gap-2">
            <input
              value={child.label}
              onChange={(e) => updateField(child, "label", e.target.value)}
              placeholder="Label"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--text-primary)]"
            />
            <input
              value={child.cmd}
              onChange={(e) => updateField(child, "cmd", e.target.value)}
              placeholder="Command"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 font-mono text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((item) => item.id !== child.id))}
              disabled={options.length === 1}
              aria-label="Remove option"
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
            >
              <TrashIcon />
            </button>
          </div>
          {child.cmd.trim() && (
            <div className="space-y-4 border-l-2 border-[var(--border)] pl-4">
              <RunModePicker
                runMode={child.runMode}
                reuse={child.reuse}
                onRunMode={(mode) => updateChild(child.id, { runMode: mode })}
                onReuse={(value) => updateChild(child.id, { reuse: value })}
              />
              <ConfirmPicker
                confirm={child.confirm}
                onConfirm={(value) => updateChild(child.id, { confirm: value })}
              />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, newChild()])}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <PlusIcon /> Add menu option
      </button>
    </div>
  );
}

function RunModePicker({
  runMode,
  reuse,
  onRunMode,
  onReuse,
}: {
  runMode: RunMode;
  reuse: boolean;
  onRunMode: (mode: RunMode) => void;
  onReuse: (value: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">How should it run?</span>
        <span className="text-[12px] text-[var(--text-muted)]">{runModeHint(runMode, reuse)}</span>
      </div>
      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[var(--border)]">
        <ModeButton active={runMode === "once"} icon={<ZapIcon />} title="Show in modal" onClick={() => onRunMode("once")} />
        <ModeButton active={runMode === "terminal"} icon={<TerminalIcon />} title="Run in new terminal" onClick={() => onRunMode("terminal")} />
        <ModeButton active={runMode === "background"} icon={<SparkleIcon />} title="Run in background" onClick={() => onRunMode("background")} />
      </div>
      {runMode === "terminal" && (
        <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input type="checkbox" checked={reuse} onChange={(e) => onReuse(e.target.checked)} />
          Reuse the same pane when I run this action again
        </label>
      )}
    </div>
  );
}

function ConfirmPicker({
  confirm,
  onConfirm,
}: {
  confirm: boolean;
  onConfirm: (value: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">Confirm before running?</span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {confirm ? "Shows a confirmation dialog before running." : "Runs as soon as you click."}
        </span>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--border)]">
        <ModeButton active={!confirm} icon={<PlayIcon />} title="Run immediately" onClick={() => onConfirm(false)} />
        <ModeButton active={confirm} icon={<HelpCircleIcon />} title="Ask before running" onClick={() => onConfirm(true)} />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 border-r border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium transition last:border-r-0 ${
        active
          ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
          : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      {title}
    </button>
  );
}

