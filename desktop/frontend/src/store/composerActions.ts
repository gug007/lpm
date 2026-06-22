import { useMemo } from "react";
import { create } from "zustand";
import { LoadComposerActions, SaveComposerActions } from "../../bridge/commands";
import {
  BookOpen,
  Briefcase,
  Code2,
  Feather,
  FileText,
  Languages,
  ListChecks,
  Maximize2,
  MessageSquare,
  Minimize2,
  ScrollText,
  Smile,
  Sparkles,
  SpellCheck,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";

// A user-defined composer action: an AI instruction that transforms the current
// composer text (improve a prompt, rewrite it, fix grammar, etc.). Stored in its
// own file (~/.lpm/composer-actions.json) so the set is shared across every
// terminal and survives restart.
export interface ComposerAction {
  id: string;
  icon: string; // a key into COMPOSER_ACTION_ICONS; falls back to a sparkle
  label: string; // shown as the tooltip / list label
  instruction: string; // the AI prompt applied to the text
  enabled: boolean; // only enabled actions appear in the composer
}

// The icon palette offered when creating/editing an action. Kept small and
// purposeful so the picker stays a single tidy row rather than an icon dump.
export const COMPOSER_ACTION_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "sparkles", Icon: Sparkles },
  { name: "wand", Icon: Wand2 },
  { name: "zap", Icon: Zap },
  { name: "spellcheck", Icon: SpellCheck },
  { name: "minimize", Icon: Minimize2 },
  { name: "maximize", Icon: Maximize2 },
  { name: "list", Icon: ListChecks },
  { name: "languages", Icon: Languages },
  { name: "briefcase", Icon: Briefcase },
  { name: "code", Icon: Code2 },
  { name: "file", Icon: FileText },
  { name: "scroll", Icon: ScrollText },
  { name: "book", Icon: BookOpen },
  { name: "message", Icon: MessageSquare },
  { name: "feather", Icon: Feather },
  { name: "smile", Icon: Smile },
];

const ICON_MAP = new Map(COMPOSER_ACTION_ICONS.map((i) => [i.name, i.Icon]));

export const DEFAULT_ACTION_ICON = "sparkles";

export function composerActionIcon(name: string): LucideIcon {
  return ICON_MAP.get(name) ?? Sparkles;
}

// Seeded actions. The two everyday rewrites are enabled out of the box; the
// rest stay disabled so the composer stays clean until the user opts in.
export const DEFAULT_COMPOSER_ACTIONS: ComposerAction[] = [
  {
    id: "improve",
    icon: "sparkles",
    label: "Improve prompt",
    instruction:
      "Rewrite this into a clearer, more specific, well-structured prompt for an AI coding agent. Resolve ambiguous pronouns and references, remove vagueness, and fill in obvious missing context that is already implied. Keep the original intent and do not add new requirements the user didn't imply.",
    enabled: true,
  },
  {
    id: "concise",
    icon: "minimize",
    label: "Make concise",
    instruction:
      "Rewrite this to be as concise and direct as possible while preserving all meaning, intent, and every requirement or constraint. Cut filler and repetition but keep all specifics, file names, and acceptance criteria intact.",
    enabled: true,
  },
  {
    id: "grammar",
    icon: "spellcheck",
    label: "Fix grammar",
    instruction:
      "Fix spelling, grammar, and punctuation only. Do not change the meaning, wording style, or tone, and do not alter any technical terms, code, file paths, or commands beyond what is strictly needed for correctness.",
    enabled: false,
  },
  {
    id: "debug",
    icon: "code",
    label: "Debug request",
    instruction:
      "Rewrite this into a debugging request for an AI coding agent. Keep the full error message or stack trace verbatim, then frame the ask around it: state the observed symptom, point to the likely location if the user implied one, ask the agent to identify the root cause before changing code, then fix the root cause rather than suppressing the error and verify the fix. Use only information present here, and do not invent error details, causes, or reproduction steps the user didn't provide.",
    enabled: false,
  },
  {
    id: "scope",
    icon: "zap",
    label: "Scope it",
    instruction:
      "Rewrite this as a tightly scoped instruction for an AI coding agent. State exactly what should change, name only the files or areas the request already implies as in scope, explicitly mark everything else as out of scope, and tell the agent not to refactor unrelated code or add unrequested features. Keep the original goal and do not introduce new goals, files, or requirements the user didn't state.",
    enabled: false,
  },
  {
    id: "acceptance",
    icon: "list",
    label: "Add acceptance criteria",
    instruction:
      "Rewrite this request to end with explicit, verifiable acceptance criteria that define when the task is done. Phrase each as a concrete, checkable condition (a specific behavior, exact expected output, or a test or command that should pass), covering the obvious edge and error cases the request already implies, so two people could not disagree about whether it passed. Stay faithful to the original intent and do not invent unrelated requirements.",
    enabled: false,
  },
  {
    id: "plan",
    icon: "file",
    label: "Plan first",
    instruction:
      "Rewrite this so the AI coding agent plans before writing any code. Instruct it to first explore the relevant code, then produce a step-by-step implementation plan covering what will change, in which files, in what order, plus any risks or open questions, and to stop for review without making edits yet. Preserve the original task as the thing being planned and do not add new requirements.",
    enabled: false,
  },
  {
    id: "english",
    icon: "languages",
    label: "Translate to English",
    instruction:
      "Translate this text to English, preserving the original meaning, intent, and any technical terms, code, file paths, or commands. If it is already entirely in English, return it unchanged.",
    enabled: false,
  },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function seedDefaults(): ComposerAction[] {
  return DEFAULT_COMPOSER_ACTIONS.map((a) => ({ ...a }));
}

// Pull the action array out of the loaded file. The backend returns the file's
// JSON (we save `{ actions: [...] }`) or Null when the file is absent; a bare
// array is also accepted defensively. Returns null when there's nothing valid.
function extractList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const arr = (raw as { actions?: unknown }).actions;
    if (Array.isArray(arr)) return arr;
  }
  return null;
}

// Validate the loaded file into a clean list. An absent/corrupt file (first run)
// yields the seeded defaults; a saved-but-empty list stays empty.
function normalizeComposerActions(raw: unknown): ComposerAction[] {
  const list = extractList(raw);
  if (list === null) return seedDefaults();
  return list.filter(isRecord).map((a) => ({
    id: typeof a.id === "string" && a.id ? a.id : crypto.randomUUID(),
    icon: typeof a.icon === "string" && a.icon ? a.icon : DEFAULT_ACTION_ICON,
    label: typeof a.label === "string" ? a.label : "",
    instruction: typeof a.instruction === "string" ? a.instruction : "",
    enabled: a.enabled === true,
  }));
}

export function createComposerAction(): ComposerAction {
  return { id: crypto.randomUUID(), icon: DEFAULT_ACTION_ICON, label: "", instruction: "", enabled: true };
}

interface ComposerActionsStore {
  actions: ComposerAction[];
  hydrate: () => Promise<void>;
  save: (actions: ComposerAction[]) => Promise<void>;
}

// Reactive, file-backed store. Seeded with the defaults so the UI has something
// before hydrate resolves; main.tsx awaits hydrate() before first render.
export const useComposerActionsStore = create<ComposerActionsStore>((set) => ({
  actions: seedDefaults(),
  hydrate: async () => {
    try {
      const raw = await LoadComposerActions();
      set({ actions: normalizeComposerActions(raw) });
    } catch {
      set({ actions: seedDefaults() });
    }
  },
  // Optimistically update in memory, then write the file. The list is wrapped in
  // `{ actions }` so the file shape stays self-describing.
  save: async (actions) => {
    set({ actions });
    try {
      await SaveComposerActions({ actions });
    } catch {
      // Best-effort persistence; the in-memory state already reflects the change.
    }
  },
}));

export function hydrateComposerActions(): Promise<void> {
  return useComposerActionsStore.getState().hydrate();
}

export function saveComposerActions(list: ComposerAction[]): Promise<void> {
  return useComposerActionsStore.getState().save(list);
}

// Reactive view of the full action list.
export function useComposerActions(): ComposerAction[] {
  return useComposerActionsStore((s) => s.actions);
}

// Just the enabled actions, in order — what the composer surfaces.
export function useEnabledComposerActions(): ComposerAction[] {
  const actions = useComposerActionsStore((s) => s.actions);
  return useMemo(() => actions.filter((a) => a.enabled), [actions]);
}
