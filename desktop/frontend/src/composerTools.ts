// The terminal input's tools. Each one lives either in the button row under
// the field, as a button of its own, or inside its More menu, and the user
// moves it between the two from either place.

// Canonical order, used by both places, so moving a tool out and back leaves
// the row exactly as it was. Model is listed last because it keeps its seat at
// the right edge beside Send whenever it is in the row.
export const COMPOSER_TOOL_IDS = [
  "mic",
  "actions",
  "newInput",
  "drafts",
  "history",
  "memory",
  "fork",
  "forkCopy",
  "model",
] as const;

export type ComposerToolId = (typeof COMPOSER_TOOL_IDS)[number];

export const COMPOSER_TOOL_LABEL: Record<ComposerToolId, string> = {
  mic: "Dictate",
  actions: "Refine with AI",
  newInput: "New prompt",
  drafts: "Drafts",
  history: "Recent messages",
  memory: "Memory",
  fork: "Fork session",
  forkCopy: "Fork into copy",
  model: "Model",
};

// Forking into a copy is a once-in-a-while move, so it starts in the menu;
// everything else is reached often enough that a menu hop would be a tax.
export const DEFAULT_COMPOSER_TOOLBAR: readonly ComposerToolId[] = [
  "mic",
  "actions",
  "newInput",
  "drafts",
  "history",
  "memory",
  "fork",
  "model",
];

export type ComposerToolVariant = "button" | "row";

// How a tool presents itself: its own button in the row, or a row in the More
// menu. A tool with a panel of its own reports the panel opening and closing
// so the menu can stay put behind it and fold away once it is done.
export interface ComposerToolPresentation {
  variant?: ComposerToolVariant;
  onOpenChange?: (open: boolean) => void;
}

export function isComposerToolId(value: unknown): value is ComposerToolId {
  return typeof value === "string" && (COMPOSER_TOOL_IDS as readonly string[]).includes(value);
}

/** Sanitize a stored list: known ids only, deduped, in canonical order.
 *  `undefined` for anything that isn't a list, so an emptied row stays
 *  distinct from one that was never touched. */
export function normalizeComposerToolbar(raw: unknown): ComposerToolId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return COMPOSER_TOOL_IDS.filter((id) => raw.includes(id));
}

/** The list with `id` moved into the button row or back into the menu. */
export function withComposerToolbar(
  current: readonly ComposerToolId[],
  id: ComposerToolId,
  inToolbar: boolean,
): ComposerToolId[] {
  return COMPOSER_TOOL_IDS.filter((item) => (item === id ? inToolbar : current.includes(item)));
}

/** The tools the menu is left holding, in canonical order. */
export function composerMenuTools(inToolbar: readonly ComposerToolId[]): ComposerToolId[] {
  return COMPOSER_TOOL_IDS.filter((id) => !inToolbar.includes(id));
}

export function isDefaultComposerToolbar(current: readonly ComposerToolId[]): boolean {
  return (
    current.length === DEFAULT_COMPOSER_TOOLBAR.length &&
    DEFAULT_COMPOSER_TOOLBAR.every((id, i) => current[i] === id)
  );
}
