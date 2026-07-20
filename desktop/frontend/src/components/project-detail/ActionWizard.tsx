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
  mergeActionPayload,
  moveAction,
  readActionPayload,
  replaceAction,
  replaceActionPayload,
  type ActionConfigLayer,
  type ActionPatch,
} from "../../actionConfig";
import { applyAutoSettings, type RunMode } from "./actionInference";
import {
  actionInfoFromPayload,
  pickUnmanaged,
  reorderById,
  toRunMode,
  unmanagedActionKeys,
  unmanagedFieldsChanged,
  yamlToActionInfo,
} from "./actionYaml";
import { AdvancedDisclosure } from "./AdvancedDisclosure";
import { AlsoConfiguredChip } from "./AlsoConfiguredChip";
import { useProjectSuggestions } from "./useProjectSuggestions";
import { filterStaticTemplates, type ActionTemplate } from "./projectSuggestions";
import { SortableItem, SortableList } from "../ui/SortableList";
import { MonacoEditor } from "../MonacoEditor";
import { ACTION_MODEL_URI } from "../../monaco-setup";
import { slugify } from "../../slugify";
import { uniqueKey } from "../../uniqueKey";
import { withEmoji } from "../../withEmoji";
import { isFooterDisplay, type ActionInfo } from "../../types";
import { forEachAction } from "../../actionTree";
import { useShortcutCapture } from "../../hooks/useShortcutCapture";
import { useSettingsStore } from "../../store/settings";
import { configuredHotkeyCombos } from "../../hotkeys";
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
  GripVerticalIcon,
  HelpCircleIcon,
  MoonIcon,
  PanelBottomIcon,
  PanelTopIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SendIcon,
  TerminalIcon,
  TrashIcon,
  XIcon,
  ZapIcon,
} from "../icons";
import { Modal } from "../ui/Modal";
import { AIButton } from "../ui/AIButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TrafficLights } from "../ui/TrafficLights";
import { EmojiSlotButton } from "../EmojiPickerButton";
import { useOutsideClick } from "../../hooks/useOutsideClick";

type Shape = "button" | "split" | "dropdown";

type PreviewHint = "shape" | "placement" | "runMode" | "confirm";

const SHAPE_PREVIEW_BUTTON_CLASS =
  "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]";

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
  // Local-only flags: once the user (or a deliberate prefill) sets run mode or
  // confirm, auto-inference stops overriding it. Never serialized to YAML.
  runModeTouched: boolean;
  confirmTouched: boolean;
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
  // The project's directory, scanned for real commands to suggest as templates.
  // Absent for rootless mounts; skipped for remote/SSH projects.
  projectRoot?: string;
  isRemote?: boolean;
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
    runModeTouched: false,
    confirmTouched: false,
  };
}

function runModeHint(mode: RunMode, reuse: boolean) {
  if (mode === "terminal") {
    return reuse
      ? "Reuses the same terminal each time you run this action."
      : "Opens a new terminal every time you run this action.";
  }
  if (mode === "command")
    return "Types the command into the terminal you're currently using.";
  if (mode === "background")
    return "Runs quietly in the background and notifies you when it's done.";
  return "Runs once and shows the output in a pop-up.";
}

function wizardCopy(editing: boolean): {
  title: string;
  primary: string;
} {
  if (editing) {
    return {
      title: "Edit action",
      primary: "Save changes",
    };
  }
  return {
    title: "Add an action",
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
    runModeTouched: true,
    confirmTouched: true,
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
  display: "header" | "footer";
  // Local-only, see ChildDraft. Kept out of every buildActionPatch / build*
  // path so they never reach YAML.
  runModeTouched: boolean;
  confirmTouched: boolean;
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
  display,
}: FormDraft): ActionPatch {
  const set: Record<string, unknown> = { label: name.trim() };
  const remove: string[] = [];

  if (emoji.trim()) set.emoji = emoji.trim();
  else remove.push("emoji");

  // A shortcut runs the action's own command, so it only applies to the
  // command-bearing shapes; dropdowns have no command to fire.
  if (shape !== "dropdown" && shortcut.trim()) set.shortcut = shortcut.trim();
  else remove.push("shortcut");

  if (display === "footer") set.display = "footer";
  else remove.push("display");

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
  base: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const { set } = buildActionPatch(draft);
  return { ...pickUnmanaged(base), ...set, display: draft.display, position };
}

// Semantic identity of a draft for dirty checks. Raw draft JSON won't do:
// regenerated child UUIDs and touched flags differ after a mere editor→form
// round-trip even though nothing the user cares about changed.
function draftSignature(draft: FormDraft): string {
  return JSON.stringify({
    patch: buildActionPatch(draft),
    configLayer: draft.configLayer,
  });
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
    workingBase: Record<string, unknown>;
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
    payload: buildCreatePayload(draft, context.nextPosition, context.workingBase),
  };
}

// Serializes the current edit-mode state for the YAML editor by merging the
// form's patch onto the action's on-disk payload, so fields the form doesn't
// manage (env, inputs, position, ...) ride along instead of being dropped.
function buildEditorContentForEdit(
  draft: FormDraft,
  base: Record<string, unknown> | null,
): string {
  const merged = mergeActionPayload(base, buildActionPatch(draft));
  return YAML.stringify(merged, { lineWidth: 0 });
}

function buildCreateEditorContent(
  draft: FormDraft,
  position: number,
  base: Record<string, unknown> | null = null,
): string {
  return YAML.stringify(buildCreatePayload(draft, position, base), {
    lineWidth: 0,
  });
}

function inferShape(action: ActionInfo): Shape {
  const hasChildren = (action.children?.length ?? 0) > 0;
  const hasCmd = Boolean(action.cmd);
  if (hasChildren && hasCmd) return "split";
  if (hasChildren) return "dropdown";
  return "button";
}

function actionToDraft(action: ActionInfo): FormDraft {
  const children: ChildDraft[] = (action.children ?? []).map((c) => ({
    id: crypto.randomUUID(),
    label: c.label,
    cmd: c.cmd,
    runMode: toRunMode(c.type),
    reuse: c.reuse ?? false,
    confirm: c.confirm,
    runModeTouched: true,
    confirmTouched: true,
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
    display: isFooterDisplay(action.display) ? "footer" : "header",
    runModeTouched: true,
    confirmTouched: true,
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
    display: "header",
    runModeTouched: false,
    confirmTouched: false,
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
  projectRoot,
  isRemote = false,
  onClose,
  onSaved,
}: ActionWizardProps) {
  const isEditing = Boolean(editing);
  const projectSuggestions = useProjectSuggestions({
    open,
    editing: isEditing,
    isRemote,
    projectRoot,
  });
  const [draft, setDraft] = useState<FormDraft>(defaultDraft);
  const [hoveredHint, setHoveredHint] = useState<PreviewHint | null>(null);
  const [showYaml, setShowYaml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"form" | "editor">("form");
  const [editorContent, setEditorContent] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSeed, setEditorSeed] = useState(0);
  const [editSource, setEditSource] = useState<ActionConfigLayer | null>(null);
  // Edit mode only: the layer the user wants to move this action to. Null means
  // "leave it where it is". Armed by picking a different layer than editSource;
  // the move runs on Save, before the field save.
  const [moveTarget, setMoveTarget] = useState<ActionConfigLayer | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // The action's full on-disk payload (edit mode only). Null until the read
  // resolves; drives the editor merge so unmanaged fields survive a save.
  const [editingPayload, setEditingPayload] =
    useState<Record<string, unknown> | null>(null);
  // The merge base for every editor seed: the on-disk payload in edit mode, or
  // the unmanaged fields the user typed in the editor and carried back to the
  // form. Unlike editingPayload it tracks in-session editor edits, so switching
  // editor→form→editor no longer drops hand-authored fields.
  const [workingBase, setWorkingBase] = useState<Record<string, unknown>>({});
  // Dirtiness baselines captured at open: the form draft and the editor's
  // original canonical serialization. Editor edits are dirty when the content
  // diverges from this baseline, not from whatever it was last re-seeded with.
  const [baselineDraft, setBaselineDraft] = useState<FormDraft | null>(null);
  const [editorBaseline, setEditorBaseline] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  // Mirrors for the async payload read: it must seed the editor iff the editor
  // is showing when it resolves, from the draft as it is then — the stored mode
  // and the draft captured at open may both be stale by that point.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Read at open time only. Keeping nextPosition out of the reset effect's deps
  // stops a background refresh (which hands the parent's array props fresh
  // identities) from re-firing the reset and wiping in-progress edits.
  const nextPositionRef = useRef(nextPosition);
  nextPositionRef.current = nextPosition;

  useEffect(() => {
    if (!open) return;
    const nextDraft = editing ? actionToDraft(editing) : defaultDraft();
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setShowYaml(false);
    setSaving(false);
    setEditorError(null);
    setEditSource(null);
    setMoveTarget(null);
    setAiModalOpen(false);
    setDiscardOpen(false);
    setEditingPayload(null);
    setWorkingBase({});
    const initialMode = readStoredMode();
    if (initialMode === "editor") {
      // Edit mode seeds lazily once editingPayload resolves (see the read
      // effect) to avoid serializing a payload that's missing on-disk fields.
      if (editing) {
        setEditorContent("");
        setEditorBaseline("");
      } else {
        const content = buildCreateEditorContent(nextDraft, nextPositionRef.current);
        setEditorContent(content);
        setEditorBaseline(content);
      }
      setEditorSeed((n) => n + 1);
      setMode("editor");
    } else {
      setMode("form");
      if (!editing) setEditorBaseline("");
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open || !editing) return;
    let cancelled = false;
    Promise.all([
      findActionSource(projectName, editing.name),
      readActionPayload(projectName, editing.name),
    ]).then(([layer, payload]) => {
      if (cancelled) return;
      setEditSource(layer);
      const base = payload ?? {};
      setEditingPayload(base);
      setWorkingBase(base);
      setEditorBaseline(buildEditorContentForEdit(actionToDraft(editing), base));
      if (modeRef.current === "editor") {
        setEditorContent(buildEditorContentForEdit(draftRef.current, base));
        setEditorSeed((n) => n + 1);
      }
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
    display,
  } = draft;
  const takenShortcuts = useMemo(
    () => collectTakenShortcuts(actions, editing?.name),
    [actions, editing?.name],
  );
  const nameFilled = Boolean(name.trim());
  const cmdFilled = Boolean(cmd.trim());
  const hasMenuOption = children.some((child) => child.cmd.trim());
  // A brand-new create form with nothing typed yet: the disabled primary button
  // is signal enough, so we hold back the "Name is required" hint until the user
  // actually starts filling the form.
  const isPristine =
    !isEditing &&
    !nameFilled &&
    !cmdFilled &&
    !children.some((child) => child.label.trim() || child.cmd.trim());
  const showShape = nameFilled;
  const showCommand = shape !== "dropdown";
  const showRunMode = showCommand && cmdFilled;
  const showMenuOptions =
    nameFilled && (shape === "dropdown" || (shape === "split" && cmdFilled));
  const missingHint = getMissingHint(draft, hasMenuOption);
  const formIsValid = missingHint === null;
  const actionLabel = withEmoji(emoji, name.trim() || PLACEHOLDER_LABEL);
  const { title, primary: primaryLabel } = wizardCopy(isEditing);
  const savingLabel = isEditing ? "Saving..." : "Creating...";

  const updateField = <K extends keyof FormDraft>(
    key: K,
    value: FormDraft[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const updateName = (value: string) =>
    setDraft((prev) => ({
      ...prev,
      name: value,
      ...applyAutoSettings(
        {
          name: value,
          cmd: prev.cmd,
          runModeTouched: prev.runModeTouched,
          confirmTouched: prev.confirmTouched,
        },
        "terminal",
      ),
    }));

  const updateCmd = (value: string) =>
    setDraft((prev) => ({
      ...prev,
      cmd: value,
      ...applyAutoSettings(
        {
          name: prev.name,
          cmd: value,
          runModeTouched: prev.runModeTouched,
          confirmTouched: prev.confirmTouched,
        },
        "terminal",
      ),
    }));

  const setRunMode = (mode: RunMode) =>
    setDraft((prev) => ({ ...prev, runMode: mode, runModeTouched: true }));

  const setConfirm = (value: boolean) =>
    setDraft((prev) => ({ ...prev, confirm: value, confirmTouched: true }));

  // The layer to move the action into on Save, or null when no move is armed.
  const pendingMoveTarget =
    isEditing && editSource && moveTarget && moveTarget !== editSource
      ? moveTarget
      : null;

  // Relocates the action before the field save so replaceAction/-Payload find
  // it in its new home. A collision throws before either layer is touched, so
  // the surrounding try/catch surfaces it without a partial write.
  const runPendingMove = async (key: string) => {
    if (pendingMoveTarget && editSource) {
      await moveAction(projectName, key, editSource, pendingMoveTarget);
    }
  };

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
        workingBase,
      });
      if (submission.kind === "edit") {
        await runPendingMove(submission.key);
        // A plain replaceAction patch leaves unmanaged fields alone, which is
        // safest against concurrent external edits — but if the user changed
        // env/inputs/etc. in the editor before switching to the form, only a
        // whole-payload write applies them.
        if (unmanagedFieldsChanged(workingBase, editingPayload ?? {})) {
          await replaceActionPayload(
            projectName,
            submission.key,
            mergeActionPayload(workingBase, submission.patch),
          );
        } else {
          await replaceAction(projectName, submission.key, submission.patch);
        }
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
        await runPendingMove(editing.name);
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
    if (editing) {
      // While the on-disk payload is still loading, leave the editor empty (it
      // shows a loading state); the read effect seeds it on resolve. Seeding
      // from a null base here would serialize without the unmanaged fields.
      setEditorContent(
        editingPayload === null
          ? ""
          : buildEditorContentForEdit(draft, workingBase),
      );
    } else {
      setEditorContent(buildCreateEditorContent(draft, nextPosition, workingBase));
      setEditorBaseline(
        buildCreateEditorContent(baselineDraft ?? draft, nextPosition),
      );
    }
    setEditorError(null);
    setEditorSeed((n) => n + 1);
    setMode("editor");
    writeStoredMode("editor");
  };

  // Parses the editor content back into the form. Invalid or non-mapping YAML
  // keeps us in the editor with the error shown rather than silently discarding
  // the edits. Unmanaged fields the user typed become the new workingBase so
  // they survive the next editor seed and a form-side save.
  const switchToForm = () => {
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
    setDraft((prev) => ({
      ...actionToDraft(actionInfoFromPayload(payload)),
      configLayer: prev.configLayer,
    }));
    setWorkingBase(payload);
    setEditorError(null);
    setMode("form");
    writeStoredMode("form");
  };

  const buildCurrentYAML = (): string => {
    if (editing) return buildEditorContentForEdit(draft, workingBase);
    if (!draft.name.trim() && !draft.cmd.trim()) return "";
    return buildCreateEditorContent(draft, nextPosition, workingBase);
  };

  const isDirty = () => {
    if (pendingMoveTarget) return true;
    if (mode === "editor") return editorContent !== editorBaseline;
    if (baselineDraft && draftSignature(draft) !== draftSignature(baselineDraft))
      return true;
    // Editor-only edits to unmanaged fields leave the form draft untouched, so
    // also compare the carried unmanaged fields against their on-disk origin.
    return unmanagedFieldsChanged(workingBase, editing ? editingPayload ?? {} : {});
  };

  const requestClose = () => {
    if (saving) return;
    if (isDirty()) setDiscardOpen(true);
    else onClose();
  };

  const applyAiResult = (yaml: string) => {
    setEditorContent(yaml);
    try {
      const info = yamlToActionInfo(yaml);
      setWorkingBase(YAML.parse(yaml) as Record<string, unknown>);
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
        onClose={requestClose}
        closeOnEscape={!discardOpen && !aiModalOpen}
        closeOnBackdrop={!discardOpen && !aiModalOpen}
        backdropClassName="bg-black/50 backdrop-blur-sm"
        contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      >
        <div
          className="flex max-h-[min(820px,92vh)] w-[min(960px,calc(100vw-32px))] flex-col"
          onKeyDown={onKeyDown}
        >
          <header className="px-7 pb-4 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
                  <ZapIcon />
                </div>
                <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="-mr-2 -mt-2 rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <XIcon />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                {isEditing ? (
                  editSource ? (
                    <ConfigLayerMenu
                      value={moveTarget ?? editSource}
                      onChange={(next) =>
                        setMoveTarget(next === editSource ? null : next)
                      }
                    />
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <FolderIcon />
                      Locating config…
                    </div>
                  )
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
            {mode === "form" && unmanagedActionKeys(workingBase).length > 0 && (
              <div className="mt-3">
                <AlsoConfiguredChip
                  payload={workingBase}
                  onOpenEditor={switchToEditor}
                />
              </div>
            )}
          </header>

          {mode === "editor" ? (
            <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] px-7 py-6">
              <div className="min-h-[420px] flex-1 overflow-hidden rounded-lg border border-[var(--border)]">
                {isEditing && editingPayload === null ? (
                  <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
                    Loading action…
                  </div>
                ) : (
                  <MonacoEditor
                    key={`action-editor-${editing?.name ?? "new"}-${editorSeed}`}
                    value={editorContent}
                    onChange={setEditorContent}
                    language="yaml"
                    modelUri={ACTION_MODEL_URI}
                    onSave={() => void submit()}
                  />
                )}
              </div>
              {editorError && (
                <p className="mt-3 text-[12px] text-[var(--text-error,#e15252)]">
                  {editorError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] lg:flex-row">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-7 py-6">
                {!isEditing && !nameFilled && !cmdFilled && (
                  <TemplateGallery
                    onPick={pickTemplate}
                    suggestions={projectSuggestions}
                  />
                )}
                <FieldSection label="Name">
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
                      className="w-full rounded-lg border border-transparent bg-[var(--bg-secondary)] py-3 pl-12 pr-4 text-[14px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
                    />
                  </div>
                </FieldSection>

                {showCommand && (
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
                )}

                {showShape && (
                  <Reveal className="relative z-20">
                    <div
                      onMouseEnter={() => setHoveredHint("shape")}
                      onMouseLeave={() => setHoveredHint(null)}
                    >
                      <FieldSection label="Appearance">
                        <ShapeMenu
                          shape={shape}
                          options={SHAPE_OPTIONS}
                          previewLabel={actionLabel}
                          onChange={(next) => updateField("shape", next)}
                        />
                      </FieldSection>
                    </div>
                  </Reveal>
                )}

                {showShape && (
                  <Reveal>
                    <div
                      onMouseEnter={() => setHoveredHint("placement")}
                      onMouseLeave={() => setHoveredHint(null)}
                    >
                      <DisplayPicker
                        display={display}
                        onChange={(value) => updateField("display", value)}
                      />
                    </div>
                  </Reveal>
                )}

                {showRunMode && (
                  <Reveal>
                    <div className="space-y-6">
                      <div
                        onMouseEnter={() => setHoveredHint("runMode")}
                        onMouseLeave={() => setHoveredHint(null)}
                      >
                        <RunModePicker
                          runMode={runMode}
                          reuse={reuse}
                          onRunMode={setRunMode}
                          onReuse={(value) => updateField("reuse", value)}
                        />
                      </div>
                      <div
                        onMouseEnter={() => setHoveredHint("confirm")}
                        onMouseLeave={() => setHoveredHint(null)}
                      >
                        <ConfirmPicker
                          confirm={confirm}
                          onConfirm={setConfirm}
                        />
                      </div>
                      <AdvancedDisclosure
                        hasValue={Boolean(
                          cwd.trim() || port.trim() || shortcut.trim(),
                        )}
                      >
                        <CommandField
                          label="Working directory"
                          hint="Defaults to the project directory"
                          value={cwd}
                          onChange={(value) => updateField("cwd", value)}
                          onEnter={() => void submit()}
                          placeholder="./backend"
                        />
                        <PortField
                          port={port}
                          portConflict={portConflict}
                          onPort={(value) => updateField("port", value)}
                          onPortConflict={(value) =>
                            updateField("portConflict", value)
                          }
                        />
                        <ShortcutField
                          value={shortcut}
                          taken={takenShortcuts}
                          onChange={(value) => updateField("shortcut", value)}
                        />
                      </AdvancedDisclosure>
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
                        workingBase,
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
                display={display}
                hoveredHint={hoveredHint}
              />
            </div>
          )}

          <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-7 py-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <AIButton
                onClick={() => setAiModalOpen(true)}
                disabled={isEditing && editingPayload === null}
                title={
                  isEditing
                    ? "Edit this action with AI"
                    : "Generate an action with AI"
                }
              >
                {isEditing ? "Edit with AI" : "Generate with AI"}
              </AIButton>
            </div>
            <div className="flex items-center gap-3">
              {mode === "form" && missingHint && !isPristine && (
                <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">
                  {missingHint}
                </span>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving || (mode === "form" && !formIsValid)}
                className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
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
      <ConfirmDialog
        open={discardOpen}
        title="Discard changes?"
        body="Your edits to this action won't be saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="destructive"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
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
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl">
          {MODE_OPTIONS.map((opt) => {
            const active = opt.value === mode;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(opt.value)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
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
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[260px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl">
          {CONFIG_LAYER_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(opt.value)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
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
      <div className="text-[12px] font-medium text-[var(--text-secondary)]">
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
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  const reservedCombos = useMemo(() => configuredHotkeyCombos(hotkeys), [hotkeys]);
  const { recording, hint, toggle } = useShortcutCapture({
    reserved: reservedCombos,
    onCapture: onChange,
  });

  const parsed = value ? parseShortcut(value) : null;
  const reserved = parsed ? isReservedShortcut(parsed, reservedCombos) : false;
  const duplicate = parsed ? taken.has(canonicalShortcut(parsed)) : false;

  const warning =
    parsed && reserved
      ? `${formatShortcut(parsed)} is reserved by lpm`
      : parsed && duplicate
        ? `${formatShortcut(parsed)} is already used by another action`
        : null;
  const borderClass = recording
    ? "border-[var(--accent-cyan)] bg-[var(--bg-secondary)]"
    : warning
      ? "border-[var(--text-error,#e15252)] bg-[var(--bg-secondary)]"
      : "border-transparent bg-[var(--bg-secondary)]";

  return (
    <FieldSection label="Keyboard shortcut">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className={`flex-1 rounded-lg border px-4 py-3 text-left text-[14px] outline-none transition ${borderClass} ${
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
            onClick={() => onChange("")}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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

function TemplateButton({
  template,
  onPick,
}: {
  template: ActionTemplate;
  onPick: (template: ActionTemplate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-transparent bg-[var(--bg-secondary)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)]"
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
  );
}

function TemplateGrid({
  templates,
  onPick,
}: {
  templates: ActionTemplate[];
  onPick: (template: ActionTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {templates.map((template) => (
        <TemplateButton key={template.id} template={template} onPick={onPick} />
      ))}
    </div>
  );
}

function DisclosureToggle({
  open,
  label,
  onClick,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
    >
      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      {label}
    </button>
  );
}

const VISIBLE_SUGGESTIONS = 6;

function TemplateGallery({
  onPick,
  suggestions,
}: {
  onPick: (template: ActionTemplate) => void;
  suggestions: ActionTemplate[];
}) {
  const hasSuggestions = suggestions.length > 0;
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [showStaticTemplates, setShowStaticTemplates] = useState(false);
  const staticTemplates = useMemo(
    () =>
      hasSuggestions
        ? filterStaticTemplates(ACTION_TEMPLATES, suggestions)
        : ACTION_TEMPLATES,
    [hasSuggestions, suggestions],
  );

  if (!hasSuggestions) {
    return (
      <div className="space-y-5">
        <FieldSection label="Start with a template">
          <TemplateGrid templates={staticTemplates} onPick={onPick} />
        </FieldSection>
        <PathDivider />
      </div>
    );
  }

  const visibleSuggestions = showAllSuggestions
    ? suggestions
    : suggestions.slice(0, VISIBLE_SUGGESTIONS);
  const hiddenCount = suggestions.length - visibleSuggestions.length;

  return (
    <div className="space-y-5">
      <FieldSection label="Suggested for this project">
        <TemplateGrid templates={visibleSuggestions} onPick={onPick} />
        {hiddenCount > 0 && (
          <DisclosureToggle
            open={showAllSuggestions}
            label={showAllSuggestions ? "Show fewer" : `Show ${hiddenCount} more`}
            onClick={() => setShowAllSuggestions((value) => !value)}
          />
        )}
      </FieldSection>
      {staticTemplates.length > 0 && (
        <div className="space-y-2.5">
          <DisclosureToggle
            open={showStaticTemplates}
            label="More templates"
            onClick={() => setShowStaticTemplates((value) => !value)}
          />
          {showStaticTemplates && (
            <TemplateGrid templates={staticTemplates} onPick={onPick} />
          )}
        </div>
      )}
      <PathDivider />
    </div>
  );
}

function PathDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        or create your own
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
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
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
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

type FrameHighlight = "header" | "footer" | "content" | null;

const PREVIEW_RING =
  "0 0 0 3px color-mix(in srgb, var(--accent-cyan) 35%, transparent)";
const PREVIEW_TINT = "color-mix(in srgb, var(--accent-cyan) 16%, transparent)";
const PREVIEW_CONTENT_RING =
  "inset 0 0 0 1px color-mix(in srgb, var(--accent-cyan) 45%, transparent)";
const DEMO_OUTPUT_WIDTHS = ["72%", "48%", "62%"];

function useDemoScript(
  cmd: string,
  steps: number,
  onFinished?: () => void,
) {
  const [chars, setChars] = useState(0);
  const [step, setStep] = useState(0);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    setChars(0);
    setStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const charMs = 28;
    const stepMs = 260;
    let typed = 0;
    const typeNext = () => {
      typed += 1;
      setChars(typed);
      if (typed < cmd.length) {
        timers.push(setTimeout(typeNext, charMs));
        return;
      }
      for (let s = 1; s <= steps; s += 1) {
        timers.push(
          setTimeout(() => {
            setStep(s);
            if (s === steps) finishedRef.current?.();
          }, s * stepMs),
        );
      }
      if (steps === 0) finishedRef.current?.();
    };
    timers.push(setTimeout(typeNext, charMs));
    return () => timers.forEach(clearTimeout);
  }, [cmd, steps]);

  return { typed: cmd.slice(0, chars), typingDone: chars >= cmd.length, step };
}

function ActionPreviewPanel({
  name,
  emoji,
  shape,
  options,
  runMode,
  confirm,
  cmd,
  display,
  hoveredHint,
}: {
  name: string;
  emoji: string;
  shape: Shape;
  options: ChildDraft[];
  runMode: RunMode;
  confirm: boolean;
  cmd: string;
  display: "header" | "footer";
  hoveredHint: PreviewHint | null;
}) {
  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;
  const displayLabel = withEmoji(emoji, trimmedName);
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState<DemoState>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [demoFinished, setDemoFinished] = useState(false);
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

  useEffect(() => {
    setDemoFinished(false);
  }, [running, replayNonce]);

  const triggerRun = () => {
    if (!canRun) return;
    setRunning(confirm ? "confirm" : runMode);
  };

  const handleConfirm = () => setRunning(runMode);
  const handleCancel = () => setRunning(null);
  const replayDemo = () => {
    setDemoFinished(false);
    setReplayNonce((n) => n + 1);
  };

  const shownRunning: DemoState =
    hoveredHint === "confirm" && confirm ? "confirm" : running;
  const frameHighlight: FrameHighlight =
    hoveredHint === "placement"
      ? display
      : hoveredHint === "runMode"
        ? "content"
        : null;

  const dropdown = menuOpen && (
    <div className="absolute right-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl">
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
    <aside className="flex border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-6 lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="flex min-h-[140px] flex-1 flex-col lg:min-h-0">
        <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Preview
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          {!hasName ? (
            <div className="flex w-full flex-col items-center gap-3">
              <MockActionPlaceholder
                display={display}
                highlight={frameHighlight}
              />
              <span className="text-[11px] text-[var(--text-muted)]">
                Your action appears here.
              </span>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-4">
              <div
                className="rounded-lg transition-shadow duration-150"
                style={
                  hoveredHint === "shape"
                    ? { boxShadow: PREVIEW_RING }
                    : undefined
                }
              >
                {shape === "button" ? (
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
              </div>

              {canRun && (
                <>
                  <RunModeDemo
                    key={`${running ?? "idle"}-${replayNonce}`}
                    running={shownRunning}
                    cmd={cmd}
                    label={displayLabel}
                    display={display}
                    highlight={frameHighlight}
                    onTrigger={triggerRun}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onFinished={() => setDemoFinished(true)}
                  />
                  {demoFinished ? (
                    <button
                      type="button"
                      onClick={replayDemo}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
                    >
                      <RefreshIcon />
                      Replay
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Click the button to try it.
                    </span>
                  )}
                </>
              )}
            </div>
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

function MockAppFrame({
  headerSlot,
  footerSlot,
  highlight = null,
  children,
}: {
  headerSlot: ReactNode;
  footerSlot?: ReactNode;
  highlight?: FrameHighlight;
  children: ReactNode;
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

        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="flex h-[16px] items-center justify-end border-b border-[var(--border)] px-1.5 transition-colors duration-150"
            style={
              highlight === "header"
                ? { backgroundColor: PREVIEW_TINT }
                : undefined
            }
          >
            {headerSlot}
          </div>

          <div
            className="relative flex-1 overflow-hidden p-2 transition-shadow duration-150"
            style={
              highlight === "content"
                ? { boxShadow: PREVIEW_CONTENT_RING }
                : undefined
            }
          >
            {children}
          </div>

          {footerSlot && (
            <div
              className="flex h-[16px] items-center border-t border-[var(--border)] px-1.5 transition-colors duration-150"
              style={
                highlight === "footer"
                  ? { backgroundColor: PREVIEW_TINT }
                  : undefined
              }
            >
              {footerSlot}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MockBodyLines() {
  return (
    <div className="space-y-1">
      <div className="h-[3px] w-3/4 rounded bg-[var(--border)] opacity-70" />
      <div className="h-[3px] w-1/2 rounded bg-[var(--border)] opacity-70" />
      <div className="h-[3px] w-2/3 rounded bg-[var(--border)] opacity-70" />
      <div className="h-[3px] w-1/3 rounded bg-[var(--border)] opacity-70" />
    </div>
  );
}

function MockActionPlaceholder({
  display,
  highlight = null,
}: {
  display: "header" | "footer";
  highlight?: FrameHighlight;
}) {
  const slot = (
    <span
      key={display}
      className="demo-slot-in h-[9px] w-[34px] rounded-[3px] border border-dashed border-[var(--border)]"
    />
  );
  return (
    <MockAppFrame
      headerSlot={display === "header" ? slot : null}
      footerSlot={display === "footer" ? slot : undefined}
      highlight={highlight}
    >
      <MockBodyLines />
    </MockAppFrame>
  );
}

function RunModeDemo({
  running,
  cmd,
  label,
  display,
  highlight,
  onTrigger,
  onConfirm,
  onCancel,
  onFinished,
}: {
  running: DemoState;
  cmd: string;
  label: string;
  display: "header" | "footer";
  highlight: FrameHighlight;
  onTrigger: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onFinished: () => void;
}) {
  const actionButton = (
    <button
      key={display}
      type="button"
      onClick={onTrigger}
      className="demo-slot-in max-w-[80px] truncate rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-[1px] text-[7px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
    >
      {label}
    </button>
  );
  return (
    <MockAppFrame
      headerSlot={display === "header" ? actionButton : null}
      footerSlot={display === "footer" ? actionButton : undefined}
      highlight={highlight}
    >
      <MockBodyLines />

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
        <OnceDemo
          cmd={cmd}
          label={label}
          onCancel={onCancel}
          onFinished={onFinished}
        />
      )}

      {running === "terminal" && (
        <TerminalDemo prompt="$" cmd={cmd} onFinished={onFinished} />
      )}

      {running === "command" && (
        <TerminalDemo prompt="~ %" cmd={cmd} priorPrompt onFinished={onFinished} />
      )}

      {running === "background" && (
        <BackgroundDemo label={label} onFinished={onFinished} />
      )}
    </MockAppFrame>
  );
}

function TerminalDemo({
  prompt,
  cmd,
  priorPrompt = false,
  onFinished,
}: {
  prompt: string;
  cmd: string;
  priorPrompt?: boolean;
  onFinished: () => void;
}) {
  const { typed, typingDone, step } = useDemoScript(cmd, 3, onFinished);
  return (
    <div className="demo-terminal absolute inset-0 overflow-hidden bg-black p-1.5 font-mono text-[7px] leading-tight text-white/90">
      {priorPrompt && <div className="truncate text-white/40">{prompt}</div>}
      <div className="truncate">
        {prompt} {typed}
        {!typingDone && (
          <span className="demo-cursor ml-[1px] inline-block h-[6px] w-[3px] translate-y-[1px] bg-white/80" />
        )}
      </div>
      {typingDone && (
        <div className="mt-1 space-y-1">
          {DEMO_OUTPUT_WIDTHS.map((width, i) => (
            <div
              key={i}
              className="h-[3px] rounded bg-white/25 transition-opacity duration-200"
              style={{ width, opacity: step > i ? 1 : 0 }}
            />
          ))}
        </div>
      )}
      {step >= 3 && (
        <div className="mt-1 flex items-center gap-1 text-white/50">
          <span>{prompt}</span>
          <span className="demo-cursor inline-block h-[6px] w-[3px] bg-white/80" />
        </div>
      )}
    </div>
  );
}

function OnceDemo({
  cmd,
  label,
  onCancel,
  onFinished,
}: {
  cmd: string;
  label: string;
  onCancel: () => void;
  onFinished: () => void;
}) {
  const { typed, typingDone, step } = useDemoScript(cmd, 2, onFinished);
  return (
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
          $ {typed}
          {!typingDone && (
            <span className="demo-cursor ml-[1px] inline-block h-[5px] w-[2px] translate-y-[1px] bg-[var(--text-primary)]" />
          )}
        </div>
        {step >= 1 && <div className="text-[var(--text-muted)]">output…</div>}
        {step >= 2 && <div className="text-[var(--text-muted)]">✓ Done</div>}
      </div>
    </MockModalShell>
  );
}

function BackgroundDemo({
  label,
  onFinished,
}: {
  label: string;
  onFinished: () => void;
}) {
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    const timer = setTimeout(() => finishedRef.current(), 1200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="demo-toast absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-1 shadow">
      <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--text-secondary)]" />
      <span className="max-w-[90px] truncate text-[7px] text-[var(--text-secondary)]">
        {label} running…
      </span>
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
        className={`flex w-full items-center gap-2 rounded-lg border py-2.5 pl-4 pr-3.5 text-left transition ${
          open
            ? "border-[var(--accent-cyan)] bg-[var(--bg-primary)]"
            : "border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[13px] text-[var(--text-primary)]">
            {current.title}
          </span>
          {current.badge && <ShapeBadge label={current.badge} />}
        </span>
        <span className="shrink-0 text-[var(--text-muted)]">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl">
          {options.map((opt) => {
            const active = opt.shape === shape;
            return (
              <button
                key={opt.shape}
                type="button"
                onClick={() => choose(opt.shape)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
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
      <span className="mb-2 flex items-center justify-between gap-3 text-[12px] font-medium text-[var(--text-secondary)]">
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
        className="w-full rounded-lg border border-transparent bg-[var(--bg-secondary)] px-4 py-3 font-mono text-[13px] text-[var(--text-primary)] outline-none transition placeholder:font-sans placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
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
    updateChild(child.id, {
      [field]: value,
      ...applyAutoSettings(
        {
          name: field === "label" ? value : child.label,
          cmd: field === "cmd" ? value : child.cmd,
          runModeTouched: child.runModeTouched,
          confirmTouched: child.confirmTouched,
        },
        "once",
      ),
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-[12px] font-medium text-[var(--text-secondary)]">
        Menu options
      </div>
      <SortableList
        ids={options.map((child) => child.id)}
        onReorder={(order) => onChange(reorderById(options, order))}
      >
        {options.map((child) => (
          <SortableItem key={child.id} id={child.id}>
            <div className="space-y-4 pb-3">
              <div className="grid grid-cols-[auto_minmax(90px,0.8fr)_minmax(140px,1.4fr)_auto] items-center gap-2">
                <span
                  aria-hidden
                  className="flex cursor-grab items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                >
                  <GripVerticalIcon />
                </span>
                <input
                  value={child.label}
                  onChange={(e) => updateField(child, "label", e.target.value)}
                  placeholder="Label"
                  className="rounded-lg border border-transparent bg-[var(--bg-secondary)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-cyan)]"
                />
                <input
                  value={child.cmd}
                  onChange={(e) => updateField(child, "cmd", e.target.value)}
                  placeholder="Command"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="rounded-lg border border-transparent bg-[var(--bg-secondary)] px-3 py-2.5 font-mono text-[12px] text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-cyan)]"
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
                    onRunMode={(mode) =>
                      updateChild(child.id, {
                        runMode: mode,
                        runModeTouched: true,
                      })
                    }
                    onReuse={(value) => updateChild(child.id, { reuse: value })}
                  />
                  <ConfirmPicker
                    confirm={child.confirm}
                    onConfirm={(value) =>
                      updateChild(child.id, {
                        confirm: value,
                        confirmTouched: true,
                      })
                    }
                  />
                </div>
              )}
            </div>
          </SortableItem>
        ))}
      </SortableList>
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
    title: "Run in a new terminal",
    description: "Opens a new terminal — good for servers and long-running commands.",
  },
  {
    value: "once",
    icon: <ZapIcon />,
    title: "Run and show the output",
    description: "Runs once and shows the output in a pop-up — good for quick commands.",
  },
  {
    value: "command",
    icon: <SendIcon />,
    title: "Send to the active terminal",
    description: "Types the command into the terminal you're currently using.",
  },
  {
    value: "background",
    icon: <MoonIcon />,
    title: "Run in the background",
    description: "Runs quietly and notifies you when it's done.",
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
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          Run mode
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {runModeHint(runMode, reuse)}
        </span>
      </div>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2.5 rounded-lg border py-2.5 pl-4 pr-3.5 text-left transition ${
            open
              ? "border-[var(--accent-cyan)] bg-[var(--bg-primary)]"
              : "border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
          }`}
        >
          <span className="shrink-0 text-[var(--text-primary)]">
            {current.icon}
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]">
            {current.title}
          </span>
          <span className="shrink-0 text-[var(--text-muted)]">
            <ChevronDownIcon />
          </span>
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl">
            {RUN_MODE_OPTIONS.map((opt) => {
              const active = opt.value === runMode;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(opt.value)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
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
          Reuse the same terminal when I run this action again
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
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          Confirmation
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

function DisplayPicker({
  display,
  onChange,
}: {
  display: "header" | "footer";
  onChange: (value: "header" | "footer") => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          Placement
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {display === "footer"
            ? "Pinned to the terminal footer bar."
            : "In the header row above the terminal."}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
        <ModeButton
          active={display === "header"}
          icon={<PanelTopIcon />}
          title="Header"
          onClick={() => onChange("header")}
        />
        <ModeButton
          active={display === "footer"}
          icon={<PanelBottomIcon />}
          title="Footer"
          onClick={() => onChange("footer")}
        />
      </div>
    </div>
  );
}

