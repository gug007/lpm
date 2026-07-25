import type { ActionInputInfo } from "../../types";
import { slugify } from "../../slugify";
import { uniqueKey } from "../../uniqueKey";

// The questions an action asks before it runs. The command is the source of
// truth for which questions exist and in what order: every `{{key}}` token in
// it maps to one question, and the saved `position` mirrors the order the
// tokens appear so the run dialog asks for them in reading order.

export type InputType = "text" | "radio" | "password";

export interface InputOptionDraft {
  id: string;
  label: string;
  value: string;
}

export interface InputDraft {
  id: string;
  key: string;
  label: string;
  type: InputType;
  required: boolean;
  placeholder: string;
  default: string;
  persist: boolean;
  options: InputOptionDraft[];
  // True while the key is derived from the label, so renaming the question also
  // rewrites its token in the command. Cleared for keys we discovered in a
  // hand-typed token — those belong to the user, not to us.
  autoKey: boolean;
}

// Matches the literal `{{key}}` the backend substitutes (config-side the
// replace is exact, so no whitespace is tolerated inside the braces).
const TOKEN = /\{\{([A-Za-z0-9_.-]+)\}\}/g;

const INPUT_TYPES = new Set<string>(["text", "radio", "password"]);

export function toInputType(value: string | undefined): InputType {
  return value && INPUT_TYPES.has(value) ? (value as InputType) : "text";
}

// Distinct `{{key}}` tokens in the order they first appear.
export function commandTokens(cmd: string): string[] {
  const out: string[] = [];
  for (const match of cmd.matchAll(TOKEN)) {
    if (!out.includes(match[1])) out.push(match[1]);
  }
  return out;
}

export function newInputDraft(
  key: string,
  overrides: Partial<InputDraft> = {},
): InputDraft {
  return {
    id: crypto.randomUUID(),
    key,
    label: "",
    type: "text",
    required: false,
    placeholder: "",
    default: "",
    persist: false,
    options: [],
    autoKey: false,
    ...overrides,
  };
}

export function newOptionDraft(value = ""): InputOptionDraft {
  return { id: crypto.randomUUID(), label: "", value };
}

// A question's key, derived from its label. Falls back to a generic key so a
// freshly added question always has a usable token to insert.
export function inputKeyFromLabel(label: string, taken: string[]): string {
  return uniqueKey(slugify(label) || "value", taken);
}

// Reconciles the questions with the command. Tokens lead: they set the order
// and add questions the user typed by hand. Questions whose token was deleted
// are kept (dropping them would discard settings on a stray keystroke) and
// sorted to the end, where the editor flags them as unused.
export function syncInputsToCommand(
  inputs: InputDraft[],
  cmd: string,
): InputDraft[] {
  const tokens = commandTokens(cmd);
  const byKey = new Map(inputs.map((input) => [input.key, input]));
  const next: InputDraft[] = [];
  for (const key of tokens) {
    const existing = byKey.get(key);
    next.push(existing ?? newInputDraft(key, { label: key }));
    byKey.delete(key);
  }
  for (const input of inputs) if (byKey.has(input.key)) next.push(input);

  const unchanged =
    next.length === inputs.length &&
    next.every((input, index) => input === inputs[index]);
  return unchanged ? inputs : next;
}

export function isUnused(input: InputDraft, cmd: string): boolean {
  return !commandTokens(cmd).includes(input.key);
}

export function insertToken(
  cmd: string,
  key: string,
  caret: number | null,
): { cmd: string; caret: number } {
  const token = `{{${key}}}`;
  const at = caret === null || caret < 0 || caret > cmd.length ? cmd.length : caret;
  const before = cmd.slice(0, at);
  const after = cmd.slice(at);
  // Keep the token a separate argument: pad only where it would otherwise weld
  // itself onto neighbouring text.
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";
  return {
    cmd: `${before}${lead}${token}${trail}${after}`,
    caret: before.length + lead.length + token.length,
  };
}

export function removeToken(cmd: string, key: string): string {
  return cmd
    .split(`{{${key}}}`)
    .join("")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+$/gm, "");
}

export function renameToken(cmd: string, from: string, to: string): string {
  return cmd.split(`{{${from}}}`).join(`{{${to}}}`);
}

// What the run dialog would submit for a question with nothing typed: its
// default, the first choice, or the placeholder — otherwise the key itself, so
// the preview never shows an empty gap.
export function previewValue(input: InputDraft): string {
  if (input.default.trim()) return input.default;
  if (input.type === "radio") {
    const first = input.options.find((option) => option.value.trim());
    if (first) return first.value;
  }
  if (input.type === "password") return "••••••";
  return input.placeholder.trim() || input.key;
}

export interface CommandSegment {
  text: string;
  // True for text substituted in place of a token, which the preview tints.
  filled: boolean;
  // The question that filled this segment, so the preview can name it.
  key?: string;
}

// The command with every token replaced, split so the substituted values can be
// highlighted. Answers override the previewed defaults.
export function commandSegments(
  cmd: string,
  inputs: InputDraft[],
  answers: Record<string, string> = {},
): CommandSegment[] {
  const byKey = new Map(inputs.map((input) => [input.key, input]));
  const segments: CommandSegment[] = [];
  let last = 0;
  for (const match of cmd.matchAll(TOKEN)) {
    const input = byKey.get(match[1]);
    if (!input) continue;
    const at = match.index ?? 0;
    if (at > last) segments.push({ text: cmd.slice(last, at), filled: false });
    const answer = answers[input.key];
    segments.push({
      text: answer?.trim() ? answer : previewValue(input),
      filled: true,
      key: input.key,
    });
    last = at + match[0].length;
  }
  if (last < cmd.length) segments.push({ text: cmd.slice(last), filled: false });
  return segments;
}

export function resolveCommand(
  cmd: string,
  inputs: InputDraft[],
  answers: Record<string, string> = {},
): string {
  return commandSegments(cmd, inputs, answers)
    .map((segment) => segment.text)
    .join("");
}

// The value the run dialog starts on, used to seed the interactive preview.
export function initialAnswers(inputs: InputDraft[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const input of inputs) {
    out[input.key] =
      input.default ||
      (input.type === "radio" ? (input.options[0]?.value ?? "") : "");
  }
  return out;
}

export function inputDraftsFromInfos(
  infos: ActionInputInfo[] | undefined,
): InputDraft[] {
  return (infos ?? []).map((info) =>
    newInputDraft(info.key, {
      label: info.label === info.key ? "" : info.label,
      type: toInputType(info.type),
      required: Boolean(info.required),
      placeholder: info.placeholder ?? "",
      default: info.default ?? "",
      persist: Boolean(info.persist),
      options: (info.options ?? []).map((option) => ({
        id: crypto.randomUUID(),
        label: option.label === option.value ? "" : option.label,
        value: option.value,
      })),
    }),
  );
}

function optionToYaml(option: InputOptionDraft): unknown {
  const value = option.value.trim();
  const label = option.label.trim();
  return label && label !== value ? { label, value } : value;
}

// The `inputs:` mapping for the action body, or undefined when there are no
// questions (so the key is dropped rather than written empty). `position` is
// emitted only when the command's order differs from the alphabetical order the
// backend would otherwise apply — same rule the menu-children map follows.
export function inputsToYamlMap(
  inputs: InputDraft[],
): Record<string, unknown> | undefined {
  const usable = inputs.filter((input) => input.key.trim());
  if (usable.length === 0) return undefined;

  const keys = usable.map((input) => input.key);
  const sorted = [...keys].sort();
  const needsPositions = keys.some((key, index) => key !== sorted[index]);

  const out: Record<string, unknown> = {};
  usable.forEach((input, index) => {
    const body: Record<string, unknown> = {};
    const label = input.label.trim();
    if (label && label !== input.key) body.label = label;
    if (input.type !== "text") body.type = input.type;
    if (input.required) body.required = true;
    const placeholder = input.placeholder.trim();
    if (placeholder && input.type !== "radio") body.placeholder = placeholder;
    if (input.default.trim()) body.default = input.default.trim();
    if (input.persist) body.persist = true;
    if (input.type === "radio") {
      const options = input.options
        .filter((option) => option.value.trim())
        .map(optionToYaml);
      if (options.length) body.options = options;
    }
    if (needsPositions) body.position = index + 1;
    out[input.key] = body;
  });
  return out;
}

// A question is publishable once it can actually be answered: choice questions
// need choices, and a pinned default must be one of them.
export function inputProblem(input: InputDraft): string | null {
  if (input.type !== "radio") return null;
  const values = input.options
    .map((option) => option.value.trim())
    .filter(Boolean);
  if (values.length === 0) return "Add at least one choice";
  if (input.default.trim() && !values.includes(input.default.trim())) {
    return "The starting choice is no longer in the list";
  }
  return null;
}

export function firstInputProblem(inputs: InputDraft[]): string | null {
  for (const input of inputs) {
    const problem = inputProblem(input);
    if (problem) return problem;
  }
  return null;
}
