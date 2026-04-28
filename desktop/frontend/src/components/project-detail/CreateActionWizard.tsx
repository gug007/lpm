import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import YAML from "yaml";
import { toast } from "sonner";
import { ReadConfig, SaveConfig } from "../../../wailsjs/go/main/App";
import { slugify } from "../../slugify";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
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
import { useOutsideClick } from "../../hooks/useOutsideClick";

type Shape = "button" | "split" | "dropdown";
type RunMode = "once" | "terminal" | "background";

const SHAPE_PREVIEW_BUTTON_CLASS =
  "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]";

const SHAPE_DESCRIPTION: Record<Shape, string> = {
  button: "Header button",
  split: "Split header button",
  dropdown: "Header dropdown",
};

interface ChildDraft {
  id: string;
  label: string;
  cmd: string;
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
}

interface CreateActionWizardProps {
  open: boolean;
  projectName: string;
  existingActionKeys: string[];
  nextPosition: number;
  onClose: () => void;
  onCreated: () => void;
}

function uniqueKey(base: string, existing: string[]): string {
  const seed = base || "new-action";
  if (!existing.includes(seed)) return seed;
  let i = 2;
  while (existing.includes(`${seed}-${i}`)) i += 1;
  return `${seed}-${i}`;
}

function newChild(): ChildDraft {
  return { id: crypto.randomUUID(), label: "", cmd: "", runMode: "once", reuse: false, confirm: false };
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

function runModeLabel(mode: RunMode) {
  if (mode === "terminal") return "Run in new terminal";
  if (mode === "background") return "Run in background";
  return "Run in modal";
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

function stepCopy(step: number, shape: Shape): { title: string; hint: string; primary: string } {
  if (step === 0)
    return {
      title: "What should the button say?",
      hint: "Pick a short name. This is what you will click in the project header.",
      primary: "Continue",
    };
  if (step === 1)
    return {
      title: "How should it appear?",
      hint: "Button is best for most actions. Menus are only for related commands.",
      primary: "Continue",
    };
  if (step === 2)
    return {
      title: shape === "button" ? "What command should it run?" : "What commands belong in the menu?",
      hint: "Paste the same command you would type in a terminal.",
      primary: "Review action",
    };
  return {
    title: "Ready to add it?",
    hint: "Confirm the simple summary. The button appears in the header after creation.",
    primary: "Create action",
  };
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
  position,
}: {
  shape: Shape;
  name: string;
  cmd: string;
  children: ChildDraft[];
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
  position: number;
}) {
  const payload: Record<string, unknown> = {
    label: name.trim(),
    display: "header",
    position,
  };

  if (shape !== "dropdown") {
    payload.cmd = cmd.trim();
    if (runMode !== "once") payload.type = runMode;
    if (runMode === "terminal" && reuse) payload.reuse = true;
    if (confirm) payload.confirm = true;
  }

  if (shape !== "button") {
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
  const [reuse, setReuse] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
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
    setReuse(false);
    setConfirm(false);
    setShowYaml(false);
    setSaving(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open || step !== 2) return;
    setTimeout(() => commandRef.current?.focus(), 50);
  }, [open, step, shape]);

  const buildSubmission = () => ({
    key: uniqueKey(slugify(name), existingActionKeys),
    payload: buildActionPayload({ shape, name, cmd, children, runMode, reuse, confirm, position: nextPosition }),
  });

  const cmdFilled = Boolean(cmd.trim());
  const hasMenuOption = children.some((child) => child.cmd.trim());
  const showRunMode = shape !== "dropdown" && cmdFilled;
  const showMenuOptions = shape === "dropdown" || (shape === "split" && cmdFilled);
  const commandIsReady =
    shape === "button" ? cmdFilled : shape === "split" ? cmdFilled && hasMenuOption : hasMenuOption;
  const canContinue =
    step === 0 ? Boolean(name.trim()) : step === 2 ? commandIsReady : true;
  const totalSteps = 4;
  const actionLabel = name.trim() || "New action";

  const { title, hint, primary: primaryLabel } = stepCopy(step, shape);

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
      const { key, payload } = buildSubmission();
      await appendAction(projectName, key, payload);
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
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex max-h-[88vh] w-[min(960px,calc(100vw-32px))] flex-col" onKeyDown={onKeyDown}>
        <header className="flex items-start justify-between gap-4 px-8 pb-7 pt-7">
          <div className="min-w-0 flex-1">
            <StepDots step={step} total={totalSteps} />
            <h2 className="mt-5 text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">{title}</h2>
            <p className="mt-2 max-w-[520px] text-[13px] leading-5 text-[var(--text-secondary)]">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
            {step === 0 && (
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[13px] font-medium text-[var(--text-primary)]">Button name</span>
                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => updateName(e.target.value)}
                    onKeyDown={submitOnEnter}
                    placeholder="Run tests"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3.5 text-[15px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]"
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
                  previewLabel={actionLabel}
                  onClick={() => setShape("button")}
                />
                <ShapeChoice
                  active={shape === "split"}
                  shape="split"
                  title="Split button"
                  description="A main command plus a small menu of alternatives."
                  previewLabel={actionLabel}
                  onClick={() => setShape("split")}
                />
                <ShapeChoice
                  active={shape === "dropdown"}
                  shape="dropdown"
                  title="Dropdown menu"
                  description="Only a menu. Good for grouped commands like database tasks."
                  previewLabel={actionLabel}
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
                    placeholder={shape === "split" ? "npm run deploy:staging" : "npm run dev"}
                  />
                )}

                {showRunMode && (
                  <>
                    <RunModePicker runMode={runMode} reuse={reuse} onRunMode={setRunMode} onReuse={setReuse} />
                    <ConfirmPicker confirm={confirm} onConfirm={setConfirm} />
                  </>
                )}

                {showMenuOptions && (
                  <MenuOptionsEditor options={children} onChange={setChildren} />
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">{actionLabel}</div>
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                        {SHAPE_DESCRIPTION[shape]}
                      </div>
                    </div>
                    {shape !== "dropdown" && (
                      <span className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                        {runModeLabel(runMode)}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
                    {actionSummary(shape, name, cmd, children, runMode, reuse)}
                  </p>
                  {shape !== "dropdown" && (confirm || (runMode === "terminal" && reuse)) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {confirm && <SummaryChip>Asks before running</SummaryChip>}
                      {runMode === "terminal" && reuse && <SummaryChip>Reuses pane on re-run</SummaryChip>}
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--border)] pt-5">
                  <button
                    type="button"
                    onClick={() => setShowYaml((value) => !value)}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    {showYaml ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    {showYaml ? "Hide Config" : "Show Config"}
                  </button>

                  {showYaml && (() => {
                    const { key, payload } = buildSubmission();
                    return (
                      <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
                        {YAML.stringify({ actions: { [key]: payload } }, { lineWidth: 0 })}
                      </pre>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <ActionPreviewPanel
            name={actionLabel}
            shape={shape}
            options={children}
            runMode={runMode}
            confirm={confirm}
            cmd={cmd}
          />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-8 py-4">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((current) => current - 1))}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
              <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">
                {step === 0 ? "Name is required" : "Command is required"}
              </span>
            )}
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!canContinue || saving}
              className="rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-[13px] font-semibold text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "Creating..." : primaryLabel}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === step
                ? "w-6 bg-[var(--text-primary)]"
                : i < step
                  ? "w-1 bg-[var(--text-primary)]"
                  : "w-1 bg-[var(--border)]"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {step + 1} / {total}
      </span>
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
  const hasName = name.trim().length > 0 && name !== "New action";
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
              {name}
            </button>
          ) : shape === "split" ? (
            <div ref={menuRef} className="relative">
              <span className={`inline-flex items-stretch rounded-lg border text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}>
                <button
                  type="button"
                  onClick={triggerRun}
                  className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {name}
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
                {name}
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
              label={name}
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
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
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
      className={`group relative flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition ${
        active
          ? "border-[var(--text-primary)] bg-[var(--bg-primary)]"
          : "border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--text-muted)]"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          active
            ? "border-[var(--text-primary)] bg-[var(--text-primary)]"
            : "border-[var(--border)] group-hover:border-[var(--text-muted)]"
        }`}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--bg-primary)]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</span>
          {badge && (
            <span className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12px] leading-5 text-[var(--text-secondary)]">{description}</span>
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
              placeholder={index === 0 ? "Production" : "Label"}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--text-primary)]"
            />
            <input
              value={child.cmd}
              onChange={(e) => updateField(child, "cmd", e.target.value)}
              placeholder={index === 0 ? "npm run deploy:production" : "Command"}
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
      <div className="grid grid-cols-3 gap-2">
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
      <div className="grid grid-cols-2 gap-2">
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
      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[12px] font-medium transition ${
        active
          ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-sm"
          : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      {title}
    </button>
  );
}

function SummaryChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
      {children}
    </span>
  );
}
