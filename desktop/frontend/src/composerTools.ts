// The terminal input's tools. Each one lives either in the button row under
// the field, as a button of its own, or inside its More menu, and the user
// moves it between the two from either place.

// Canonical order, used by both places, so moving a tool out and back leaves
// the row exactly as it was. Model is listed last because it keeps its seat at
// the right edge beside Send whenever it is in the row; the mic sits there too,
// taking Send's place while there's nothing to send.
export const COMPOSER_TOOL_IDS = [
  "mic",
  "actions",
  "newInput",
  "drafts",
  "history",
  "memory",
  "fork",
  "video",
  "forkCopy",
  "saveCommand",
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
  saveCommand: "Save as skill",
  video: "Answer as a video",
  model: "Model",
};

// Forking into a copy and saving a prompt as a skill are once-in-a-while
// moves, so they start in the menu; everything else is reached often enough
// that a menu hop would be a tax.
export const DEFAULT_COMPOSER_TOOLBAR: readonly ComposerToolId[] = [
  "mic",
  "actions",
  "newInput",
  "drafts",
  "history",
  "memory",
  "fork",
  "video",
  "model",
];

// The tools there were before lpm kept count of which ones a saved layout had
// seen. A layout saved then knows only these, so any tool added since takes
// its default seat rather than landing in the menu unseen.
const COMPOSER_TOOLS_BEFORE_COUNT: readonly ComposerToolId[] = [
  "mic",
  "actions",
  "newInput",
  "drafts",
  "history",
  "memory",
  "fork",
  "forkCopy",
  "saveCommand",
  "model",
];

/** A saved row with every tool added since it was saved put in its default
 *  seat: in the row when the default has it there, in the menu otherwise.
 *  `known` is what the layout had seen; absent for one saved before it was
 *  recorded. */
export function withNewComposerTools(
  row: readonly ComposerToolId[],
  known: readonly ComposerToolId[] | undefined,
): ComposerToolId[] {
  const seen = known ?? COMPOSER_TOOLS_BEFORE_COUNT;
  return COMPOSER_TOOL_IDS.filter(
    (id) => row.includes(id) || (!seen.includes(id) && DEFAULT_COMPOSER_TOOLBAR.includes(id)),
  );
}

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

// Tools that wear a dot as new until someone hovers or clicks them, or for a
// week from the first time they're on screen, whichever comes first.
export const ANNOUNCED_COMPOSER_TOOLS: readonly ComposerToolId[] = ["video"];
export const NEW_COMPOSER_TOOL_MS = 7 * 24 * 60 * 60 * 1000;

// When each announced tool stops looking new: a week after it was first on
// screen, or 0 once it's been hovered or clicked. No entry yet means it hasn't
// been on screen.
export type ComposerToolTimes = Partial<Record<ComposerToolId, number>>;

export function isNewComposerTool(id: ComposerToolId, until: number | undefined, now: number): boolean {
  return ANNOUNCED_COMPOSER_TOOLS.includes(id) && (until === undefined || now < until);
}

/** Sanitize stored times: known ids with a real time only. */
export function normalizeComposerToolTimes(raw: unknown): ComposerToolTimes | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: ComposerToolTimes = {};
  for (const [id, at] of Object.entries(raw)) {
    if (isComposerToolId(id) && typeof at === "number" && Number.isFinite(at)) out[id] = at;
  }
  return out;
}
