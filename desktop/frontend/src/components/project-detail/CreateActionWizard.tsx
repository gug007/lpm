import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import YAML from "yaml";
import { toast } from "sonner";
import { ReadConfig, SaveConfig } from "../../../wailsjs/go/main/App";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SparkleIcon,
  TerminalIcon,
  TrashIcon,
  XIcon,
  ZapIcon,
} from "../icons";
import { Modal } from "../ui/Modal";

type Shape = "button" | "split" | "dropdown";
type RunMode = "once" | "terminal" | "background";

const SHAPE_PREVIEW_BUTTON_CLASS =
  "border-[var(--text-muted)] bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm";

interface ChildDraft {
  id: string;
  label: string;
  cmd: string;
}

interface InputDraft {
  id: string;
  key: string;
  label: string;
  type: "text" | "password" | "radio";
  required: boolean;
  placeholder: string;
  defaultValue: string;
  options: string;
}

interface CreateActionWizardProps {
  open: boolean;
  projectName: string;
  isRemote: boolean;
  existingActionKeys: string[];
  nextPosition: number;
  onClose: () => void;
  onCreated: () => void;
}

function newId() {
  return crypto.randomUUID();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueKey(base: string, existing: string[]): string {
  const seed = base || "new-action";
  if (!existing.includes(seed)) return seed;
  let i = 2;
  while (existing.includes(`${seed}-${i}`)) i += 1;
  return `${seed}-${i}`;
}

function newChild(): ChildDraft {
  return { id: newId(), label: "", cmd: "" };
}

function newInput(): InputDraft {
  return {
    id: newId(),
    key: "",
    label: "",
    type: "text",
    required: false,
    placeholder: "",
    defaultValue: "",
    options: "",
  };
}

function inferRunMode(text: string): RunMode {
  const value = text.toLowerCase();
  if (/\b(tail|watch|log|logs|shell|console|server)\b/.test(value)) return "terminal";
  if (/\b(fetch|pull|build|install|compile|generate)\b/.test(value)) return "background";
  return "once";
}

function shouldConfirm(text: string): boolean {
  return /\b(deploy|migrate|reset|drop|delete|destroy|remove|kill|prune)\b/i.test(text);
}

function suggestedCommand(name: string): { label: string; cmd: string } | null {
  const value = name.toLowerCase();
  if (/\b(test|spec|check)\b/.test(value)) return { label: "Use npm test", cmd: "npm test" };
  if (/\b(build|compile)\b/.test(value)) return { label: "Use npm run build", cmd: "npm run build" };
  if (/\b(dev|server|start)\b/.test(value)) return { label: "Use npm run dev", cmd: "npm run dev" };
  if (/\b(log|logs|tail)\b/.test(value)) return { label: "Use tail -f log/development.log", cmd: "tail -f log/development.log" };
  if (/\b(shell|terminal|console)\b/.test(value)) return { label: "Use current shell", cmd: "$SHELL" };
  if (/\b(migrate|migration)\b/.test(value)) return { label: "Use rails db:migrate", cmd: "rails db:migrate" };
  if (/\b(seed)\b/.test(value)) return { label: "Use rails db:seed", cmd: "rails db:seed" };
  if (/\b(deploy)\b/.test(value)) return { label: "Use deploy script", cmd: "./deploy.sh" };
  return null;
}

function runModeLabel(mode: RunMode) {
  if (mode === "terminal") return "Terminal";
  if (mode === "background") return "Background";
  return "Run once";
}

function runModeHint(mode: RunMode, reuse: boolean) {
  if (mode === "terminal") {
    return reuse ? "Opens one terminal pane and reuses it next time." : "Opens a terminal pane for the command.";
  }
  if (mode === "background") return "Runs quietly and shows a notification when it finishes.";
  return "Runs the command once and shows the result.";
}

function actionSummary(shape: Shape, name: string, cmd: string, children: ChildDraft[], runMode: RunMode, reuse: boolean) {
  const label = name.trim() || "New action";
  if (shape === "dropdown") {
    const count = children.filter((child) => child.cmd.trim()).length;
    return `${label} adds a header menu with ${count || "your"} command${count === 1 ? "" : "s"}.`;
  }
  if (shape === "split") {
    const count = children.filter((child) => child.cmd.trim()).length;
    return `${label} runs a default command and includes ${count || "extra"} menu option${count === 1 ? "" : "s"}.`;
  }
  return `${label} ${runModeHint(runMode, reuse).toLowerCase()} Command: ${cmd || "not set yet"}.`;
}

function buildActionPayload({
  shape,
  name,
  cmd,
  children,
  runMode,
  reuse,
  confirm,
  cwd,
  inputs,
  syncMode,
  position,
}: {
  shape: Shape;
  name: string;
  cmd: string;
  children: ChildDraft[];
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
  cwd: string;
  inputs: InputDraft[];
  syncMode: boolean;
  position: number;
}) {
  const payload: Record<string, unknown> = {
    label: name.trim(),
    display: "header",
    position,
  };

  if (shape !== "dropdown") payload.cmd = cmd.trim();
  if (shape !== "dropdown" && runMode !== "once") payload.type = runMode;
  if (shape !== "dropdown" && runMode === "terminal" && reuse) payload.reuse = true;
  if (shape !== "dropdown" && confirm) payload.confirm = true;
  if (cwd.trim()) payload.cwd = cwd.trim();
  if (syncMode) payload.mode = "sync";

  const inputMap: Record<string, unknown> = {};
  for (const input of inputs) {
    const key = slugify(input.key || input.label);
    if (!key) continue;
    const value: Record<string, unknown> = {};
    if (input.label.trim()) value.label = input.label.trim();
    if (input.type !== "text") value.type = input.type;
    if (input.required) value.required = true;
    if (input.placeholder.trim()) value.placeholder = input.placeholder.trim();
    if (input.defaultValue.trim()) value.default = input.defaultValue.trim();
    if (input.type === "radio") {
      const options = input.options
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean);
      if (options.length) value.options = options;
    }
    inputMap[key] = value;
  }
  if (shape !== "dropdown" && Object.keys(inputMap).length) payload.inputs = inputMap;

  if (shape !== "button") {
    const childMap: Record<string, unknown> = {};
    const used: string[] = [];
    children
      .filter((child) => child.cmd.trim())
      .forEach((child, index) => {
        const key = uniqueKey(slugify(child.label) || `option-${index + 1}`, used);
        used.push(key);
        childMap[key] = {
          label: child.label.trim() || key,
          cmd: child.cmd.trim(),
          position: index + 1,
        };
      });
    payload.actions = childMap;
  }

  return payload;
}

async function appendAction(projectName: string, key: string, payload: Record<string, unknown>) {
  const content = await ReadConfig(projectName);
  const doc = YAML.parseDocument(content || "{}");
  let actions = doc.get("actions", true);
  if (!YAML.isMap(actions)) {
    actions = doc.createNode({});
    doc.set("actions", actions);
  }
  if (YAML.isMap(actions)) actions.set(key, payload);
  await SaveConfig(projectName, String(doc));
}

export function CreateActionWizard({
  open,
  projectName,
  isRemote,
  existingActionKeys,
  nextPosition,
  onClose,
  onCreated,
}: CreateActionWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [shape, setShape] = useState<Shape>("button");
  const [cmd, setCmd] = useState("");
  const [children, setChildren] = useState<ChildDraft[]>([newChild()]);
  const [runMode, setRunMode] = useState<RunMode>("once");
  const [reuse, setReuse] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [cwd, setCwd] = useState("");
  const [inputs, setInputs] = useState<InputDraft[]>([]);
  const [syncMode, setSyncMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName("");
    setShape("button");
    setCmd("");
    setChildren([newChild()]);
    setRunMode("once");
    setReuse(true);
    setConfirm(false);
    setShowAdvanced(false);
    setShowYaml(false);
    setCwd("");
    setInputs([]);
    setSyncMode(false);
    setSaving(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open || step !== 2) return;
    setTimeout(() => commandRef.current?.focus(), 50);
  }, [open, step, shape]);

  const finalKey = useMemo(() => uniqueKey(slugify(name), existingActionKeys), [name, existingActionKeys]);
  const commandSuggestion = useMemo(() => (cmd.trim() ? null : suggestedCommand(name)), [name, cmd]);
  const payload = useMemo(
    () =>
      buildActionPayload({
        shape,
        name,
        cmd,
        children,
        runMode,
        reuse,
        confirm,
        cwd,
        inputs,
        syncMode,
        position: nextPosition,
      }),
    [shape, name, cmd, children, runMode, reuse, confirm, cwd, inputs, syncMode, nextPosition],
  );

  const commandIsReady =
    shape === "button"
      ? Boolean(cmd.trim())
      : shape === "split"
        ? Boolean(cmd.trim()) && children.some((child) => child.cmd.trim())
        : children.some((child) => child.cmd.trim());
  const canContinue = step === 0 ? Boolean(name.trim()) : step === 1 ? Boolean(shape) : step === 2 ? commandIsReady : true;
  const totalSteps = 4;
  const progress = ((step + 1) / totalSteps) * 100;
  const actionLabel = name.trim() || "New action";

  const title =
    step === 0
      ? "What should the button say?"
      : step === 1
        ? "How should it appear?"
        : step === 2
          ? shape === "button"
            ? "What command should it run?"
            : "What commands belong in the menu?"
          : "Ready to add it?";
  const hint =
    step === 0
      ? "Pick a short name. This is what you will click in the project header."
      : step === 1
        ? "Button is best for most actions. Menus are only for related commands."
        : step === 2
          ? "Paste the same command you would type in a terminal."
          : "Confirm the simple summary. The button appears in the header after creation.";
  const primaryLabel = step === 2 ? "Review action" : step === 3 ? "Create action" : "Continue";

  const updateName = (value: string) => {
    setName(value);
    const inferred = inferRunMode(`${value} ${cmd}`);
    setRunMode((current) => (current === "once" ? inferred : current));
    if (shouldConfirm(value)) setConfirm(true);
  };

  const updateCmd = (value: string) => {
    setCmd(value);
    const inferred = inferRunMode(`${name} ${value}`);
    setRunMode((current) => (current === "once" ? inferred : current));
    if (shouldConfirm(`${name} ${value}`)) setConfirm(true);
  };

  const goNext = async () => {
    if (!canContinue || saving) return;
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }

    setSaving(true);
    try {
      await appendAction(projectName, finalKey, payload);
      toast.success("Action created");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create action");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void goNext();
    }
  };

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void goNext();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex max-h-[86vh] w-[min(920px,calc(100vw-32px))] flex-col" onKeyDown={onKeyDown}>
        <div className="border-b border-[var(--border)] px-5 pb-4 pt-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Create action - Step {step + 1} of {totalSteps}
              </div>
              <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
              <p className="mt-1 max-w-[440px] text-[12px] leading-5 text-[var(--text-secondary)]">{hint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <XIcon />
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--text-primary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {step === 0 && (
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[12px] font-medium text-[var(--text-primary)]">Button name</span>
                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => updateName(e.target.value)}
                    onKeyDown={submitOnEnter}
                    placeholder="Run tests"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 text-[16px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                  />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <ShapeChoice
                  active={shape === "button"}
                  shape="button"
                  title="Button"
                  badge="Recommended"
                  description="One click runs one command. Best for most actions."
                  previewLabel="Run tests"
                  onClick={() => setShape("button")}
                />
                <ShapeChoice
                  active={shape === "split"}
                  shape="split"
                  title="Split button"
                  description="A main command plus a small menu of alternatives."
                  previewLabel="Deploy"
                  onClick={() => setShape("split")}
                />
                <ShapeChoice
                  active={shape === "dropdown"}
                  shape="dropdown"
                  title="Dropdown menu"
                  description="Only a menu. Good for grouped commands like database tasks."
                  previewLabel="Database"
                  onClick={() => setShape("dropdown")}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                {shape !== "dropdown" && (
                  <CommandField
                    inputRef={commandRef}
                    label={shape === "split" ? "Default command" : "Command"}
                    value={cmd}
                    onChange={updateCmd}
                    onEnter={() => void goNext()}
                    placeholder={shape === "split" ? "./deploy.sh staging" : "npm run dev"}
                  />
                )}

                {commandSuggestion && shape !== "dropdown" && (
                  <button
                    type="button"
                    onClick={() => updateCmd(commandSuggestion.cmd)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 text-left transition hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    <span>
                      <span className="block text-[12px] font-medium text-[var(--text-primary)]">{commandSuggestion.label}</span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">{commandSuggestion.cmd}</span>
                    </span>
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">Use</span>
                  </button>
                )}

                {shape !== "button" && (
                  <MenuOptionsEditor children={children} onChange={setChildren} />
                )}

                {shape !== "dropdown" && (
                  <RunModePicker runMode={runMode} reuse={reuse} onRunMode={setRunMode} onReuse={setReuse} />
                )}

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span>
                      <span className="block text-[12px] font-medium text-[var(--text-primary)]">Need anything extra?</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Add confirmation, a folder, prompts, or SSH sync only if needed.
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)]">
                      {showAdvanced ? "Hide" : "Show"}
                      {showAdvanced ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    </span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-4">
                      {shape !== "dropdown" && (
                        <ToggleRow
                          checked={confirm}
                          onChange={setConfirm}
                          title="Ask before running"
                          description="Recommended for deploys, deletes, and migrations."
                        />
                      )}
                      {isRemote && (
                        <ToggleRow
                          checked={syncMode}
                          onChange={setSyncMode}
                          title="Run locally on synced copy"
                          description="Uses sync mode for SSH projects."
                        />
                      )}
                      <CommandField label="Working folder" value={cwd} onChange={setCwd} placeholder="./frontend" />
                      {shape !== "dropdown" && <InputsEditor inputs={inputs} onChange={setInputs} />}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{actionLabel}</div>
                      <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
                        {shape === "button" ? "Header button" : shape === "split" ? "Split header button" : "Header dropdown"}
                      </div>
                    </div>
                    {shape !== "dropdown" && (
                      <span className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                        {runModeLabel(runMode)}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
                    {actionSummary(shape, name, cmd, children, runMode, reuse)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {confirm && <SummaryChip>Asks before running</SummaryChip>}
                    {cwd.trim() && <SummaryChip>Folder: {cwd.trim()}</SummaryChip>}
                    {Object.keys(payload.inputs as Record<string, unknown> | undefined ?? {}).length > 0 && <SummaryChip>Prompts for input</SummaryChip>}
                    {syncMode && <SummaryChip>Sync mode</SummaryChip>}
                    {shape !== "dropdown" && runMode === "terminal" && reuse && <SummaryChip>Reuses terminal</SummaryChip>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowYaml((value) => !value)}
                  className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showYaml ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  {showYaml ? "Hide YAML" : "Show YAML"}
                </button>

                {showYaml && (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    {YAML.stringify({ actions: { [finalKey]: payload } }, { lineWidth: 0 })}
                  </pre>
                )}
              </div>
            )}
          </div>

          <ActionPreviewPanel
            name={actionLabel}
            shape={shape}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((current) => current - 1))}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {step === 0 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeftIcon /> Back
              </>
            )}
          </button>
          <div className="flex items-center gap-3">
            {!canContinue && (
              <span className="hidden text-[11px] text-[var(--text-muted)] sm:inline">
                {step === 0 ? "Name is required" : "Command is required"}
              </span>
            )}
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!canContinue || saving}
              className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[12px] font-semibold text-[var(--bg-primary)] transition hover:opacity-85 disabled:opacity-40"
            >
              {saving ? "Creating..." : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ActionPreviewPanel({
  name,
  shape,
}: {
  name: string;
  shape: Shape;
}) {
  const hasName = name.trim().length > 0 && name !== "New action";

  return (
    <aside className="flex border-t border-[var(--border)] px-5 py-5 lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="flex min-h-[140px] flex-1 flex-col lg:min-h-0">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Preview
        </div>

        <div className="flex flex-1 items-center justify-center">
          {hasName ? (
            <div className="pointer-events-none max-w-full">
              <ShapePreviewButton shape={shape} label={name} />
            </div>
          ) : (
            <div className="h-7 w-24 rounded-md border border-dashed border-[var(--border)]" />
          )}
        </div>
      </div>
    </aside>
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
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-[var(--text-primary)] bg-[var(--bg-hover)]"
          : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]"
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]" : "border-[var(--border)]"
        }`}
      >
        {active && <CheckIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-[var(--text-primary)]">{title}</span>
          {badge && (
            <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12px] text-[var(--text-secondary)]">{description}</span>
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
        <span className="flex items-center rounded-r-lg border-l border-[var(--text-muted)] px-1.5">
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
      <span className="mb-2 block text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
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
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 font-mono text-[13px] text-[var(--text-primary)] outline-none transition placeholder:font-sans placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
      />
    </label>
  );
}

function MenuOptionsEditor({
  children,
  onChange,
}: {
  children: ChildDraft[];
  onChange: (children: ChildDraft[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-[var(--text-primary)]">Menu options</div>
      {children.map((child, index) => (
        <div key={child.id} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(140px,1.4fr)_auto] gap-2">
          <input
            value={child.label}
            onChange={(e) =>
              onChange(
                children.map((item) => (item.id === child.id ? { ...item, label: e.target.value } : item)),
              )
            }
            placeholder={index === 0 ? "Production" : "Label"}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
          />
          <input
            value={child.cmd}
            onChange={(e) =>
              onChange(
                children.map((item) => (item.id === child.id ? { ...item, cmd: e.target.value } : item)),
              )
            }
            placeholder={index === 0 ? "./deploy.sh prod" : "Command"}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-2 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
          />
          <button
            type="button"
            onClick={() => onChange(children.filter((item) => item.id !== child.id))}
            disabled={children.length === 1}
            aria-label="Remove option"
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...children, newChild()])}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--text-primary)]">How should it run?</span>
        <span className="text-[11px] text-[var(--text-muted)]">{runModeHint(runMode, reuse)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ModeButton active={runMode === "once"} icon={<ZapIcon />} title="Once" onClick={() => onRunMode("once")} />
        <ModeButton active={runMode === "terminal"} icon={<TerminalIcon />} title="Terminal" onClick={() => onRunMode("terminal")} />
        <ModeButton active={runMode === "background"} icon={<SparkleIcon />} title="Background" onClick={() => onRunMode("background")} />
      </div>
      {runMode === "terminal" && (
        <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input type="checkbox" checked={reuse} onChange={(e) => onReuse(e.target.checked)} />
          Reuse the same terminal pane next time
        </label>
      )}
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
      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[12px] font-medium transition ${
        active
          ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
          : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      {title}
    </button>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5">
      <input className="mt-0.5" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[12px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--text-muted)]">{description}</span>
      </span>
    </label>
  );
}

function InputsEditor({ inputs, onChange }: { inputs: InputDraft[]; onChange: (inputs: InputDraft[]) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--text-primary)]">Ask for input before running</span>
        <button
          type="button"
          onClick={() => onChange([...inputs, newInput()])}
          className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Add input
        </button>
      </div>
      {inputs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
          No prompts added.
        </div>
      ) : (
        <div className="space-y-2">
          {inputs.map((input) => (
            <div key={input.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={input.key}
                  onChange={(e) => onChange(inputs.map((item) => (item.id === input.id ? { ...item, key: e.target.value } : item)))}
                  placeholder="tag"
                  className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
                />
                <input
                  value={input.label}
                  onChange={(e) => onChange(inputs.map((item) => (item.id === input.id ? { ...item, label: e.target.value } : item)))}
                  placeholder="Release tag"
                  className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
                />
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={input.type}
                  onChange={(e) =>
                    onChange(inputs.map((item) => (item.id === input.id ? { ...item, type: e.target.value as InputDraft["type"] } : item)))
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
                >
                  <option value="text">Text</option>
                  <option value="password">Password</option>
                  <option value="radio">Choice</option>
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={input.required}
                    onChange={(e) => onChange(inputs.map((item) => (item.id === input.id ? { ...item, required: e.target.checked } : item)))}
                  />
                  Required
                </label>
              </div>
              {input.type === "radio" && (
                <input
                  value={input.options}
                  onChange={(e) => onChange(inputs.map((item) => (item.id === input.id ? { ...item, options: e.target.value } : item)))}
                  placeholder="staging, production"
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
                />
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  value={input.placeholder}
                  onChange={(e) => onChange(inputs.map((item) => (item.id === input.id ? { ...item, placeholder: e.target.value } : item)))}
                  placeholder="Placeholder"
                  className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
                />
                <input
                  value={input.defaultValue}
                  onChange={(e) => onChange(inputs.map((item) => (item.id === input.id ? { ...item, defaultValue: e.target.value } : item)))}
                  placeholder="Default"
                  className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(inputs.filter((item) => item.id !== input.id))}
                className="mt-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Remove input
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
      {children}
    </span>
  );
}
