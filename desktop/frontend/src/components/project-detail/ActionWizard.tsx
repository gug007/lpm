import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import YAML from "yaml";
import { toast } from "sonner";
import {
  appendActionToLayer,
  findActionSource,
  replaceAction,
  replaceActionPayload,
  type ActionConfigLayer,
  type ActionPatch,
} from "../../actionConfig";
import { MonacoEditor } from "../MonacoEditor";
import { slugify } from "../../slugify";
import { uniqueKey } from "../../uniqueKey";
import { withEmoji } from "../../withEmoji";
import type { ActionInfo } from "../../types";
import { forEachAction } from "../../actionTree";
import { useEventListener } from "../../hooks/useEventListener";
import type { KeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import {
  canonicalShortcut,
  formatShortcut,
  isReservedShortcut,
  parseShortcut,
} from "../../shortcutParse";
import { AIActionModal } from "./AIActionModal";
import { ModeButton } from "./ModeButton";
import {
  PortConflictPicker,
  isExplicitPolicy,
  toPickerValue,
} from "./PortConflictPicker";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  HelpCircleIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SparkleIcon,
  TerminalIcon,
  TrashIcon,
  XIcon,
  ZapIcon,
} from "../icons";
import { Modal } from "../ui/Modal";
import { TrafficLights } from "../ui/TrafficLights";
import { EmojiSlotButton } from "../EmojiPickerButton";
import { useOutsideClick } from "../../hooks/useOutsideClick";

type Shape = "button" | "split" | "dropdown";
type RunMode = "once" | "terminal" | "command" | "background";

const SHAPE_PREVIEW_BUTTON_CLASS =
  "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]";

const TERMINAL_KEYWORDS = /\b(tail|watch|log|logs|shell|console|server)\b/;
const BACKGROUND_KEYWORDS = /\b(fetch|pull|build|install|compile|generate)\b/;
const CONFIRM_KEYWORDS =
  /\b(deploy|migrate|reset|drop|delete|destroy|remove|kill|prune)\b/i;

const NEW_ACTION_KEY = "new-action";
const PLACEHOLDER_LABEL = "New action";
const MODE_STORAGE_KEY = "lpm.actionWizard.mode";

function readStoredMode(): "form" | "editor" {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "editor"
      ? "editor"
      : "form";
  } catch {
    return "form";
  }
}

function writeStoredMode(value: "form" | "editor") {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, value);
  } catch {
    // ignore quota / disabled storage
  }
}

const SHAPE_OPTIONS: Array<{
  shape: Shape;
  title: string;
  description: string;
  badge?: string;
}> = [
  {
    shape: "button",
    title: "Button",
    description: "One click runs one command.",
    badge: "Best for most actions",
  },
  {
    shape: "split",
    title: "Split button",
    description: "A main command plus a small menu.",
  },
  {
    shape: "dropdown",
    title: "Dropdown menu",
    description: "Just a menu of related commands.",
  },
];

interface ActionTemplate {
  id: string;
  emoji: string;
  name: string;
  cmd: string;
  runMode: RunMode;
  reuse?: boolean;
  confirm?: boolean;
  // Overrides where the action saves when this template is picked. Defaults to
  // whatever layer the wizard is currently on (usually "project").
  configLayer?: ActionConfigLayer;
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: "dev",
    emoji: "🚀",
    name: "Start dev server",
    cmd: "npm run dev",
    runMode: "terminal",
    reuse: true,
  },
  {
    id: "tests",
    emoji: "🧪",
    name: "Run tests",
    cmd: "npm test",
    runMode: "once",
  },
  {
    id: "build",
    emoji: "📦",
    name: "Build",
    cmd: "npm run build",
    runMode: "once",
  },
  {
    id: "install",
    emoji: "⬇️",
    name: "Install deps",
    cmd: "npm install",
    runMode: "background",
  },
  {
    id: "clean-install",
    emoji: "🧹",
    name: "Clean install",
    cmd: "rm -rf node_modules && npm install",
    runMode: "once",
    confirm: true,
  },
  {
    id: "lint",
    emoji: "✨",
    name: "Lint & fix",
    cmd: "npm run lint -- --fix",
    runMode: "once",
  },
  {
    id: "logs",
    emoji: "📜",
    name: "Tail logs",
    cmd: "tail -f log.txt",
    runMode: "terminal",
  },
  {
    id: "docker-up",
    emoji: "🐳",
    name: "Docker up",
    cmd: "docker compose up -d",
    runMode: "once",
  },
  {
    id: "migrate",
    emoji: "🗃️",
    name: "Run migrations",
    cmd: "npm run migrate",
    runMode: "once",
    confirm: true,
  },
  {
    id: "deploy",
    emoji: "🚢",
    name: "Deploy",
    cmd: "npm run deploy",
    runMode: "once",
    confirm: true,
  },
  {
    id: "ai-agent",
    emoji: "🤖",
    name: "AI coding session",
    cmd: "claude",
    runMode: "terminal",
    reuse: true,
  },
  {
    id: "claude-ultracode",
    emoji: "✻",
    name: "Claude Ultracode",
    cmd: `claude --settings '{"ultracode":true}'`,
    runMode: "terminal",
    configLayer: "global",
  },
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
  // The project's full action tree, used to warn when a keyboard shortcut is
  // already claimed by another action.
  actions?: ActionInfo[];
  // Create-only: collision avoidance for the new YAML key.
  existingActionKeys?: string[];
  // Create-only: position assigned to the new entry.
  nextPosition?: number;
  onClose: () => void;
  onSaved: () => void;
}

function newChild(): ChildDraft {
  return {
    id: crypto.randomUUID(),
    label: "",
    cmd: "",
    runMode: "once",
    reuse: false,
    confirm: false,
  };
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
function applyAutoSettings(
  prev: FormDraft,
  nextName: string,
  nextCmd: string,
): Partial<FormDraft> {
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
  if (mode === "command")
    return "Submits the command into the terminal you're currently focused on.";
  if (mode === "background")
    return "Runs in the background and shows a success notification when done.";
  return "Runs once and displays the result in a modal.";
}

function wizardCopy(editing: boolean): {
  title: string;
  hint?: string;
  primary: string;
} {
  if (editing) {
    return {
      title: "Edit action",
      primary: "Save changes",
    };
  }
  return {
    title: "Add a header action",
    hint: "Start from a template, or fill in the fields to make your own.",
    primary: "Create action",
  };
}

function applyTemplate(template: ActionTemplate, base: FormDraft): FormDraft {
  return {
    ...base,
    shape: "button",
    name: template.name,
    emoji: template.emoji,
    cmd: template.cmd,
    runMode: template.runMode,
    reuse: template.reuse ?? false,
    confirm: template.confirm ?? false,
    configLayer: template.configLayer ?? base.configLayer,
    children: [newChild()],
  };
}

function getMissingHint(
  draft: FormDraft,
  hasMenuOption: boolean,
): string | null {
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
  emoji: string;
  shortcut: string;
  cmd: string;
  cwd: string;
  port: string;
  portConflict: string;
  configLayer: ActionConfigLayer;
  children: ChildDraft[];
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
}

// Ports may be entered as a single value or a space/comma-separated list.
function parsePorts(raw: string): number[] {
  return raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535);
}

const CONFIG_LAYER_OPTIONS: Array<{
  value: ActionConfigLayer;
  label: string;
  hint: string;
}> = [
  { value: "project", label: "User", hint: "Just for you on this project" },
  { value: "repo", label: "Repo", hint: "Shared with your team via git" },
  {
    value: "global",
    label: "Global",
    hint: "Available across all your projects",
  },
];

function configLayerLabel(layer: ActionConfigLayer): string {
  return (
    CONFIG_LAYER_OPTIONS.find((opt) => opt.value === layer)?.label ?? "User"
  );
}

function buildChildMap(children: ChildDraft[]): Record<string, unknown> {
  const used: string[] = [];
  const keyed = children
    .filter((child) => child.cmd.trim())
    .map((child, index) => {
      const key = uniqueKey(
        slugify(child.label) || `option-${index + 1}`,
        used,
      );
      used.push(key);
      return { child, key };
    });

  // Only emit `position:` when the current order departs from the backend's
  // alphabetical default — otherwise we'd pollute clean YAML with redundant
  // metadata every time the wizard saves.
  const currentKeys = keyed.map((k) => k.key);
  const sortedKeys = [...currentKeys].sort();
  const needsPositions = currentKeys.some((k, i) => k !== sortedKeys[i]);

  const childMap: Record<string, unknown> = {};
  keyed.forEach(({ child, key }, index) => {
    const childPayload: Record<string, unknown> = {
      label: child.label.trim() || key,
      cmd: child.cmd.trim(),
    };
    if (needsPositions) childPayload.position = index + 1;
    if (child.runMode !== "once") childPayload.type = child.runMode;
    if (child.runMode === "terminal" && child.reuse) childPayload.reuse = true;
    if (child.confirm) childPayload.confirm = true;
    childMap[key] = childPayload;
  });
  return childMap;
}

// Returns set/remove for the wizard-managed fields. On edit, applying this
// patch leaves user-authored fields like env/inputs untouched.
function buildActionPatch({
  shape,
  name,
  emoji,
  shortcut,
  cmd,
  cwd,
  port,
  portConflict,
  children,
  runMode,
  reuse,
  confirm,
}: FormDraft): ActionPatch {
  const set: Record<string, unknown> = { label: name.trim() };
  const remove: string[] = [];

  if (emoji.trim()) set.emoji = emoji.trim();
  else remove.push("emoji");

  // A shortcut runs the action's own command, so it only applies to the
  // command-bearing shapes; dropdowns have no command to fire.
  if (shape !== "dropdown" && shortcut.trim()) set.shortcut = shortcut.trim();
  else remove.push("shortcut");

  if (shape === "dropdown") {
    remove.push("cmd", "cwd", "type", "reuse", "confirm", "port", "portConflict");
  } else {
    set.cmd = cmd.trim();
    const cwdTrim = cwd.trim();
    if (cwdTrim) set.cwd = cwdTrim;
    else remove.push("cwd");
    if (runMode !== "once") set.type = runMode;
    else remove.push("type");
    if (runMode === "terminal" && reuse) set.reuse = true;
    else remove.push("reuse");
    if (confirm) set.confirm = true;
    else remove.push("confirm");
    const ports = parsePorts(port);
    if (ports.length === 1) set.port = ports[0];
    else if (ports.length > 1) set.port = ports;
    else remove.push("port");
    if (isExplicitPolicy(portConflict)) set.portConflict = portConflict;
    else remove.push("portConflict");
  }

  if (shape === "button") remove.push("actions");
  else set.actions = buildChildMap(children);

  return { set, remove };
}

function buildCreatePayload(
  draft: FormDraft,
  position: number,
): Record<string, unknown> {
  const { set } = buildActionPatch(draft);
  return { ...set, display: "header", position };
}

type Submission =
  | { kind: "create"; key: string; payload: Record<string, unknown> }
  | {
      kind: "edit";
      key: string;
      payload: Record<string, unknown>;
      patch: ActionPatch;
    };

function buildSubmission(
  draft: FormDraft,
  context: {
    editing: ActionInfo | null | undefined;
    existingActionKeys: string[];
    nextPosition: number;
  },
): Submission {
  if (context.editing) {
    const patch = buildActionPatch(draft);
    return {
      kind: "edit",
      key: context.editing.name,
      payload: patch.set,
      patch,
    };
  }
  return {
    kind: "create",
    key: uniqueKey(
      slugify(draft.name) || NEW_ACTION_KEY,
      context.existingActionKeys,
    ),
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
  return type === "terminal" || type === "command" || type === "background" ? type : "once";
}

// Coerces AI-generated YAML into the ActionInfo shape so we can re-use
// actionToDraft. Throws if the document isn't a mapping; unknown fields are
// silently dropped — the form only surfaces what it understands.
function yamlToActionInfo(yaml: string): ActionInfo {
  const parsed = YAML.parse(yaml);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("YAML must be a mapping of action fields");
  }
  const obj = parsed as Record<string, unknown>;
  return {
    name: "",
    label: typeof obj.label === "string" ? obj.label : "",
    emoji: typeof obj.emoji === "string" ? obj.emoji : undefined,
    shortcut: typeof obj.shortcut === "string" ? obj.shortcut : undefined,
    cmd: typeof obj.cmd === "string" ? obj.cmd : "",
    cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
    confirm: Boolean(obj.confirm),
    display: typeof obj.display === "string" ? obj.display : "header",
    type: typeof obj.type === "string" ? obj.type : undefined,
    reuse: Boolean(obj.reuse),
    children: yamlChildMapToList(obj.actions),
  };
}

function yamlChildMapToList(actions: unknown): ActionInfo[] | undefined {
  if (!actions || typeof actions !== "object" || Array.isArray(actions))
    return undefined;
  const out: ActionInfo[] = [];
  for (const [name, value] of Object.entries(
    actions as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    out.push({
      name,
      label: typeof v.label === "string" ? v.label : name,
      cmd: typeof v.cmd === "string" ? v.cmd : "",
      cwd: typeof v.cwd === "string" ? v.cwd : undefined,
      confirm: Boolean(v.confirm),
      display: "",
      type: typeof v.type === "string" ? v.type : undefined,
      reuse: Boolean(v.reuse),
    });
  }
  return out.length ? out : undefined;
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
    emoji: action.emoji ?? "",
    shortcut: action.shortcut ?? "",
    cmd: action.cmd,
    cwd: action.cwd ?? "",
    port: (action.port ?? []).join(", "),
    portConflict: toPickerValue(action.portConflict),
    configLayer: "project",
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
    emoji: "",
    shortcut: "",
    cmd: "",
    cwd: "",
    port: "",
    portConflict: "",
    configLayer: "project",
    children: [newChild()],
    runMode: "terminal",
    reuse: false,
    confirm: false,
  };
}

// Canonical shortcuts already bound by other actions in the tree (the action
// being edited is excluded so re-saving it doesn't flag itself), used to warn
// about duplicates in the wizard.
function collectTakenShortcuts(
  actions: ActionInfo[],
  editingName: string | undefined,
): Set<string> {
  const taken = new Set<string>();
  forEachAction(actions, (action) => {
    if (!action.shortcut || action.name === editingName) return;
    const parsed = parseShortcut(action.shortcut);
    if (parsed) taken.add(canonicalShortcut(parsed));
  });
  return taken;
}

export function ActionWizard({
  open,
  projectName,
  editing,
  actions = [],
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
  const [editSource, setEditSource] = useState<ActionConfigLayer | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const nextDraft = editing ? actionToDraft(editing) : defaultDraft();
    setDraft(nextDraft);
    setShowYaml(false);
    setSaving(false);
    setEditorError(null);
    setEditSource(null);
    setAiModalOpen(false);
    const initialMode = readStoredMode();
    if (initialMode === "editor") {
      const submission = buildSubmission(nextDraft, {
        editing,
        existingActionKeys,
        nextPosition,
      });
      setEditorContent(YAML.stringify(submission.payload, { lineWidth: 0 }));
      setEditorSeed((n) => n + 1);
      setMode("editor");
    } else {
      setMode("form");
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, editing, existingActionKeys, nextPosition]);

  useEffect(() => {
    if (!open || !editing) return;
    let cancelled = false;
    findActionSource(projectName, editing.name).then((layer) => {
      if (!cancelled) setEditSource(layer);
    });
    return () => {
      cancelled = true;
    };
  }, [open, editing, projectName]);

  const {
    shape,
    name,
    emoji,
    shortcut,
    cmd,
    cwd,
    port,
    portConflict,
    configLayer,
    children,
    runMode,
    reuse,
    confirm,
  } = draft;
  const takenShortcuts = useMemo(
    () => collectTakenShortcuts(actions, editing?.name),
    [actions, editing?.name],
  );
  const nameFilled = Boolean(name.trim());
  const cmdFilled = Boolean(cmd.trim());
  const hasMenuOption = children.some((child) => child.cmd.trim());
  const showShape = nameFilled;
  const showCommand = nameFilled && shape !== "dropdown";
  const showRunMode = showCommand && cmdFilled;
  const showMenuOptions =
    nameFilled && (shape === "dropdown" || (shape === "split" && cmdFilled));
  const missingHint = getMissingHint(draft, hasMenuOption);
  const formIsValid = missingHint === null;
  const actionLabel = withEmoji(emoji, name.trim() || PLACEHOLDER_LABEL);
  const { title, hint, primary: primaryLabel } = wizardCopy(isEditing);
  const savingLabel = isEditing ? "Saving..." : "Creating...";

  const updateField = <K extends keyof FormDraft>(
    key: K,
    value: FormDraft[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const updateName = (value: string) =>
    setDraft((prev) => ({
      ...prev,
      name: value,
      ...applyAutoSettings(prev, value, prev.cmd),
    }));

  const updateCmd = (value: string) =>
    setDraft((prev) => ({
      ...prev,
      cmd: value,
      ...applyAutoSettings(prev, prev.name, value),
    }));

  const submit = async () => {
    if (saving) return;
    if (mode === "editor") {
      await submitFromEditor();
      return;
    }
    if (!formIsValid) return;
    setSaving(true);
    try {
      const submission = buildSubmission(draft, {
        editing,
        existingActionKeys,
        nextPosition,
      });
      if (submission.kind === "edit") {
        await replaceAction(projectName, submission.key, submission.patch);
        toast.success("Action updated");
      } else {
        await appendActionToLayer(
          projectName,
          submission.key,
          submission.payload,
          configLayer,
        );
        toast.success("Action created");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fallback = isEditing
        ? "Could not update action"
        : "Could not create action";
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
        const key = uniqueKey(
          slugify(String(payload.label ?? "")) || NEW_ACTION_KEY,
          existingActionKeys,
        );
        const withPosition = {
          display: "header",
          position: nextPosition,
          ...payload,
        };
        await appendActionToLayer(projectName, key, withPosition, configLayer);
        toast.success("Action created");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fallback = isEditing
        ? "Could not update action"
        : "Could not create action";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const switchToEditor = () => {
    const submission = buildSubmission(draft, {
      editing,
      existingActionKeys,
      nextPosition,
    });
    setEditorContent(YAML.stringify(submission.payload, { lineWidth: 0 }));
    setEditorError(null);
    setEditorSeed((n) => n + 1);
    setMode("editor");
    writeStoredMode("editor");
  };

  const switchToForm = () => {
    setEditorError(null);
    setMode("form");
    writeStoredMode("form");
  };

  const buildCurrentYAML = (): string => {
    const isFreshCreate = !editing && !draft.name.trim() && !draft.cmd.trim();
    if (isFreshCreate) return "";
    const submission = buildSubmission(draft, {
      editing,
      existingActionKeys,
      nextPosition,
    });
    return YAML.stringify(submission.payload, { lineWidth: 0 });
  };

  const applyAiResult = (yaml: string) => {
    setEditorContent(yaml);
    try {
      const info = yamlToActionInfo(yaml);
      setDraft((prev) => ({
        ...actionToDraft(info),
        configLayer: prev.configLayer,
      }));
      toast.success(
        editing ? "AI updated the action" : "AI generated an action",
      );
    } catch {
      setMode("editor");
      writeStoredMode("editor");
      toast.warning("AI output kept in editor (couldn't fit the form)");
    }
  };

  const pickTemplate = (template: ActionTemplate) => {
    setDraft((prev) => applyTemplate(template, prev));
    setTimeout(() => nameRef.current?.focus(), 50);
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
    <>
      <Modal
        open={open}
        onClose={onClose}
        backdropClassName="bg-black/50 backdrop-blur-sm"
        contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      >
        <div
          className="flex h-[min(820px,92vh)] w-[min(960px,calc(100vw-32px))] flex-col"
          onKeyDown={onKeyDown}
        >
          <header className="px-8 pb-5 pt-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
                  {title}
                </h2>
                {hint && (
                  <p className="mt-2 max-w-[520px] text-[13px] leading-5 text-[var(--text-secondary)]">
                    {hint}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-2 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <XIcon />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                {isEditing ? (
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <FolderIcon />
                    {editSource ? (
                      <>
                        Saves to{" "}
                        <span className="text-[var(--text-secondary)]">
                          {configLayerLabel(editSource)}
                        </span>{" "}
                        config
                      </>
                    ) : (
                      "Locating config…"
                    )}
                  </div>
                ) : (
                  <ConfigLayerMenu
                    value={configLayer}
                    onChange={(next) => updateField("configLayer", next)}
                  />
                )}
              </div>
              <ModeMenu
                mode={mode}
                onChange={(next) =>
                  next === "editor" ? switchToEditor() : switchToForm()
                }
              />
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
                <p className="mt-3 text-[12px] text-[var(--text-error,#e15252)]">
                  {editorError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] lg:flex-row">
              <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-8 py-7">
                {!isEditing && !nameFilled && !cmdFilled && (
                  <TemplateGallery onPick={pickTemplate} />
                )}
                <FieldSection label="Button name">
                  <div className="relative">
                    <EmojiSlotButton
                      inputRef={nameRef}
                      value={emoji}
                      onSelect={(next) => updateField("emoji", next)}
                      size="md"
                      placeholder={<TerminalIcon />}
                    />
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
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-3.5 pl-12 pr-4 text-[15px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]"
                    />
                  </div>
                </FieldSection>

                {showShape && (
                  <Reveal className="relative z-20">
                    <FieldSection label="How should it appear?">
                      <ShapeMenu
                        shape={shape}
                        options={SHAPE_OPTIONS}
                        previewLabel={actionLabel}
                        onChange={(next) => updateField("shape", next)}
                      />
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
                      placeholder={
                        shape === "split"
                          ? "npm run deploy:staging"
                          : "npm run dev"
                      }
                    />
                  </Reveal>
                )}

                {showCommand && (
                  <Reveal>
                    <CommandField
                      label="Working directory"
                      hint="Defaults to the project directory"
                      value={cwd}
                      onChange={(value) => updateField("cwd", value)}
                      onEnter={() => void submit()}
                      placeholder="./backend"
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
                      <PortField
                        port={port}
                        portConflict={portConflict}
                        onPort={(value) => updateField("port", value)}
                        onPortConflict={(value) => updateField("portConflict", value)}
                      />
                      <ShortcutField
                        value={shortcut}
                        taken={takenShortcuts}
                        onChange={(value) => updateField("shortcut", value)}
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
                      submission={buildSubmission(draft, {
                        editing,
                        existingActionKeys,
                        nextPosition,
                      })}
                    />
                  </Reveal>
                )}
              </div>

              <ActionPreviewPanel
                name={name}
                emoji={emoji}
                shape={shape}
                options={children}
                runMode={runMode}
                confirm={confirm}
                cmd={cmd}
              />
            </div>
          )}

          <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-8 py-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setAiModalOpen(true)}
                className="group relative inline-flex shrink-0 items-center rounded-xl p-[1px] [background:linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] shadow-sm transition-all hover:shadow-md hover:shadow-purple-500/20 active:scale-[0.98]"
                title={
                  isEditing
                    ? "Edit this action with AI"
                    : "Generate an action with AI"
                }
              >
                <span className="inline-flex items-center gap-1.5 rounded-[11px] bg-[var(--bg-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors group-hover:bg-transparent group-hover:text-white">
                  <SparkleIcon />
                  {isEditing ? "Edit with AI" : "Generate with AI"}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              {mode === "form" && missingHint && (
                <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">
                  {missingHint}
                </span>
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
      <AIActionModal
        open={aiModalOpen}
        projectName={projectName}
        isEditing={isEditing}
        currentYAML={buildCurrentYAML()}
        onClose={() => setAiModalOpen(false)}
        onGenerated={applyAiResult}
      />
    </>
  );
}

type WizardMode = "form" | "editor";

const MODE_OPTIONS: Array<{ value: WizardMode; label: string; hint: string }> =
  [
    { value: "form", label: "Form", hint: "Guided fields" },
    { value: "editor", label: "Editor", hint: "Raw YAML" },
  ];

function ModeMenu({
  mode,
  onChange,
}: {
  mode: WizardMode;
  onChange: (next: WizardMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  const current =
    MODE_OPTIONS.find((opt) => opt.value === mode) ?? MODE_OPTIONS[0];

  const choose = (next: WizardMode) => {
    setOpen(false);
    if (next !== mode) onChange(next);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium transition-colors ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          View
        </span>
        <span>{current.label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-2xl">
          {MODE_OPTIONS.map((opt) => {
            const active = opt.value === mode;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(opt.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-primary)]">
                  {active && <CheckIcon />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`text-[12px] font-medium ${active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigLayerMenu({
  value,
  onChange,
}: {
  value: ActionConfigLayer;
  onChange: (next: ActionConfigLayer) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const choose = (next: ActionConfigLayer) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 text-[11px] transition-colors ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <FolderIcon />
        <span>
          Saves to{" "}
          <span className="text-[var(--text-secondary)]">
            {configLayerLabel(value)}
          </span>{" "}
          config
        </span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[260px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-2xl">
          {CONFIG_LAYER_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(opt.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-primary)]">
                  {active && <CheckIcon />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`text-[12px] font-medium ${active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="text-[13px] font-medium text-[var(--text-primary)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function ShortcutField({
  value,
  taken,
  onChange,
}: {
  value: string;
  taken: Set<string>;
  onChange: (next: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const parsed = value ? parseShortcut(value) : null;
  const reserved = parsed ? isReservedShortcut(parsed) : false;
  const duplicate = parsed ? taken.has(canonicalShortcut(parsed)) : false;

  // WKWebView doesn't focus a <button> on click, so a button-level onKeyDown
  // never fires. While recording we listen on window in the capture phase
  // instead — this also blocks the combo from reaching lpm's global shortcuts.
  useEventListener(
    "keydown",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecording(false);
        setHint(null);
        return;
      }
      if (["Meta", "Shift", "Alt", "Control"].includes(event.key)) return;
      const shortcut: KeyboardShortcut = {
        key: event.key.length === 1 ? event.key.toLowerCase() : event.key,
        meta: event.metaKey || event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      };
      if (!shortcut.meta && !shortcut.alt) {
        setHint("Add ⌘ or ⌥ to make a shortcut");
        return;
      }
      if (isReservedShortcut(shortcut)) {
        setHint(`${formatShortcut(shortcut)} is reserved by lpm`);
        return;
      }
      onChange(canonicalShortcut(shortcut));
      setRecording(false);
      setHint(null);
    },
    window,
    recording,
    true,
  );

  const warning =
    parsed && reserved
      ? `${formatShortcut(parsed)} is reserved by lpm`
      : parsed && duplicate
        ? `${formatShortcut(parsed)} is already used by another action`
        : null;
  const borderClass = recording
    ? "border-[var(--text-primary)] bg-[var(--bg-primary)]"
    : warning
      ? "border-[var(--text-error,#e15252)] bg-[var(--bg-secondary)]"
      : "border-[var(--border)] bg-[var(--bg-secondary)]";

  return (
    <FieldSection label="Keyboard shortcut">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setHint(null);
            setRecording((on) => !on);
          }}
          className={`flex-1 rounded-xl border px-4 py-3 text-left text-[14px] outline-none transition ${borderClass} ${
            parsed
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-muted)]"
          }`}
        >
          {recording
            ? "Press your keys…"
            : parsed
              ? formatShortcut(parsed)
              : "Click, then press your keys"}
        </button>
        {value && !recording && (
          <button
            type="button"
            onClick={() => {
              setHint(null);
              onChange("");
            }}
            className="rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        )}
      </div>
      <p
        className={`text-[12px] ${
          hint || warning
            ? "text-[var(--text-error,#e15252)]"
            : "text-[var(--text-muted)]"
        }`}
      >
        {hint ??
          warning ??
          "Press this shortcut to run the action. Requires ⌘ or ⌥."}
      </p>
    </FieldSection>
  );
}

function TemplateGallery({
  onPick,
}: {
  onPick: (template: ActionTemplate) => void;
}) {
  return (
    <>
      <FieldSection label="Start with a template">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACTION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onPick(template)}
              className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-left transition-colors hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                {template.emoji} {template.name}
              </span>
              <span
                className="truncate font-mono text-[11px] text-[var(--text-muted)]"
                title={template.cmd}
              >
                $ {template.cmd}
              </span>
            </button>
          ))}
        </div>
      </FieldSection>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          or build your own
        </span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
    </>
  );
}

function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`field-reveal ${className}`}>{children}</div>;
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
          {YAML.stringify(
            { actions: { [submission.key]: submission.payload } },
            { lineWidth: 0 },
          )}
        </pre>
      )}
    </div>
  );
}

type DemoState = RunMode | "confirm" | null;

function ActionPreviewPanel({
  name,
  emoji,
  shape,
  options,
  runMode,
  confirm,
  cmd,
}: {
  name: string;
  emoji: string;
  shape: Shape;
  options: ChildDraft[];
  runMode: RunMode;
  confirm: boolean;
  cmd: string;
}) {
  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;
  const displayLabel = withEmoji(emoji, trimmedName);
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState<DemoState>(null);
  const menuRef = useOutsideClick<HTMLDivElement>(
    () => setMenuOpen(false),
    menuOpen,
  );
  const visibleOptions = options.filter(
    (option) => option.label.trim() || option.cmd.trim(),
  );
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
              <span
                className={`inline-flex items-stretch rounded-lg border text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}
              >
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

function MockModalShell({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
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
                  <div className="text-[8px] font-medium text-[var(--text-primary)]">
                    Run {label}?
                  </div>
                  <div className="truncate font-mono text-[7px] text-[var(--text-muted)]">
                    $ {cmd}
                  </div>
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
                  <span className="truncate text-[7px] font-medium text-[var(--text-primary)]">
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded text-[7px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-0.5 px-1.5 py-1 font-mono text-[6px] leading-tight">
                  <div className="truncate text-[var(--text-primary)]">
                    $ {cmd}
                  </div>
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

            {running === "command" && (
              <div className="demo-terminal absolute inset-0 bg-black p-1.5 font-mono text-[7px] leading-tight text-white/90">
                <div className="truncate text-white/40">~ % </div>
                <div className="truncate">~ % {cmd}</div>
                <span className="demo-cursor mt-0.5 inline-block h-[6px] w-[3px] bg-white/80" />
              </div>
            )}

            {running === "background" && (
              <div className="demo-toast absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-1 shadow">
                <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--text-secondary)]" />
                <span className="max-w-[90px] truncate text-[7px] text-[var(--text-secondary)]">
                  {label} running…
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShapeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

function ShapeMenu({
  shape,
  options,
  previewLabel,
  onChange,
}: {
  shape: Shape;
  options: typeof SHAPE_OPTIONS;
  previewLabel: string;
  onChange: (next: Shape) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  const current = options.find((opt) => opt.shape === shape) ?? options[0];

  const choose = (next: Shape) => {
    setOpen(false);
    if (next !== shape) onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={previewLabel}
        className={`flex w-full items-center gap-2 rounded-xl border py-3.5 pl-4 pr-3.5 text-left transition ${
          open
            ? "border-[var(--text-primary)] bg-[var(--bg-primary)]"
            : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[15px] text-[var(--text-primary)]">
            {current.title}
          </span>
          {current.badge && <ShapeBadge label={current.badge} />}
        </span>
        <span className="shrink-0 text-[var(--text-muted)]">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-2xl">
          {options.map((opt) => {
            const active = opt.shape === shape;
            return (
              <button
                key={opt.shape}
                type="button"
                onClick={() => choose(opt.shape)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-primary)]">
                  {active && <CheckIcon />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-[12px] font-medium ${active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                    >
                      {opt.title}
                    </span>
                    {opt.badge && <ShapeBadge label={opt.badge} />}
                  </span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">
                    {opt.description}
                  </span>
                </span>
                <span className="hidden shrink-0 sm:block">
                  <ShapePreviewButton shape={opt.shape} label={previewLabel} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
      <span
        className={`inline-flex items-stretch rounded-lg border text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}
      >
        <span className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5">
          {label}
        </span>
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
  hint,
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-[13px] font-medium text-[var(--text-primary)]">
        <span>{label}</span>
        {hint && (
          <span className="text-[12px] font-normal text-[var(--text-muted)]">
            {hint}
          </span>
        )}
      </span>
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

function PortField({
  port,
  portConflict,
  onPort,
  onPortConflict,
}: {
  port: string;
  portConflict: string;
  onPort: (value: string) => void;
  onPortConflict: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <CommandField
        label="Port"
        hint="Optional. Separate several with spaces or commas."
        value={port}
        onChange={onPort}
        placeholder="3000"
      />
      {port.trim() && (
        <PortConflictPicker value={portConflict} onChange={onPortConflict} />
      )}
    </div>
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
    onChange(
      options.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const updateField = (
    child: ChildDraft,
    field: "label" | "cmd",
    value: string,
  ) => {
    const text =
      field === "label" ? `${value} ${child.cmd}` : `${child.label} ${value}`;
    updateChild(child.id, {
      [field]: value,
      runMode: child.runMode === "once" ? inferRunMode(text) : child.runMode,
      confirm: child.confirm || shouldConfirm(text),
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-[13px] font-medium text-[var(--text-primary)]">
        Menu options
      </div>
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
              onClick={() =>
                onChange(options.filter((item) => item.id !== child.id))
              }
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

const RUN_MODE_OPTIONS: Array<{
  value: RunMode;
  icon: ReactNode;
  title: string;
  description: string;
}> = [
  {
    value: "terminal",
    icon: <TerminalIcon />,
    title: "Run in new terminal",
    description: "Opens a terminal so you can watch it run.",
  },
  {
    value: "once",
    icon: <ZapIcon />,
    title: "Show in modal",
    description: "Runs once and shows the result in a modal.",
  },
  {
    value: "command",
    icon: <SendIcon />,
    title: "Send to active terminal",
    description: "Submits it into the terminal you're focused on.",
  },
  {
    value: "background",
    icon: <SparkleIcon />,
    title: "Run in background",
    description: "Runs in the background, notifies when done.",
  },
];

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
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  const current =
    RUN_MODE_OPTIONS.find((opt) => opt.value === runMode) ?? RUN_MODE_OPTIONS[0];

  const choose = (next: RunMode) => {
    setOpen(false);
    if (next !== runMode) onRunMode(next);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">
          How should it run?
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {runModeHint(runMode, reuse)}
        </span>
      </div>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2.5 rounded-xl border py-3 pl-4 pr-3.5 text-left transition ${
            open
              ? "border-[var(--text-primary)] bg-[var(--bg-primary)]"
              : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]"
          }`}
        >
          <span className="shrink-0 text-[var(--text-primary)]">
            {current.icon}
          </span>
          <span className="min-w-0 flex-1 text-[14px] text-[var(--text-primary)]">
            {current.title}
          </span>
          <span className="shrink-0 text-[var(--text-muted)]">
            <ChevronDownIcon />
          </span>
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-2xl">
            {RUN_MODE_OPTIONS.map((opt) => {
              const active = opt.value === runMode;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(opt.value)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-primary)]">
                    {active && <CheckIcon />}
                  </span>
                  <span className="shrink-0 text-[var(--text-muted)]">
                    {opt.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={`text-[12px] font-medium ${active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                    >
                      {opt.title}
                    </span>
                    <span className="truncate text-[11px] text-[var(--text-muted)]">
                      {opt.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {runMode === "terminal" && (
        <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={reuse}
            onChange={(e) => onReuse(e.target.checked)}
          />
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">
          Confirm before running?
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {confirm
            ? "Shows a confirmation dialog before running."
            : "Runs as soon as you click."}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
        <ModeButton
          active={!confirm}
          icon={<PlayIcon />}
          title="Run immediately"
          onClick={() => onConfirm(false)}
        />
        <ModeButton
          active={confirm}
          icon={<HelpCircleIcon />}
          title="Ask before running"
          onClick={() => onConfirm(true)}
        />
      </div>
    </div>
  );
}

