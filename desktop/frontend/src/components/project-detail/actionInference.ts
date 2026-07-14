export type RunMode = "once" | "terminal" | "command" | "background";

const TERMINAL_KEYWORDS = /\b(tail|watch|log|logs|shell|console|server)\b/;
const BACKGROUND_KEYWORDS = /\b(fetch|pull|build|install|compile|generate)\b/;
const CONFIRM_KEYWORDS =
  /\b(deploy|migrate|reset|drop|delete|destroy|remove|kill|prune)\b/i;

// Returns the run mode implied by the text, or null when nothing matches so the
// caller can fall back to its own base default instead of forcing "once".
export function inferRunMode(text: string): RunMode | null {
  const value = text.toLowerCase();
  if (TERMINAL_KEYWORDS.test(value)) return "terminal";
  if (BACKGROUND_KEYWORDS.test(value)) return "background";
  return null;
}

export function shouldConfirm(text: string): boolean {
  return CONFIRM_KEYWORDS.test(text);
}

// While a field is untouched it tracks the action text both ways: run mode
// follows the matched keyword (or the base default), and confirm turns on AND
// off with the keyword. A touched field is the user's deliberate choice and is
// never overridden.
export function applyAutoSettings(
  input: {
    name: string;
    cmd: string;
    runModeTouched: boolean;
    confirmTouched: boolean;
  },
  baseRunMode: RunMode,
): { runMode?: RunMode; confirm?: boolean } {
  const text = `${input.name} ${input.cmd}`;
  const patch: { runMode?: RunMode; confirm?: boolean } = {};
  if (!input.runModeTouched) patch.runMode = inferRunMode(text) ?? baseRunMode;
  if (!input.confirmTouched) patch.confirm = shouldConfirm(text);
  return patch;
}
