// Default AI instruction text. These mirror the built-in prompt rules in the
// Rust backend (src-tauri/src/aigen.rs). The global editors seed these as
// editable content when no custom instructions are saved; the per-project
// editors show them as placeholders (blank = fall back to the global value).

export const DEFAULT_COMMIT_INSTRUCTIONS =
  "Use conventional commit format: type(scope): description\nTypes: feat, fix, refactor, docs, test, chore, style, perf\nKeep the first line under 72 characters.\nIf needed, add a blank line then a brief body paragraph.\nOutput ONLY the commit message text. No code fences. No explanation.";

export const DEFAULT_BRANCH_NAME_INSTRUCTIONS =
  "Use kebab-case (lowercase words separated by hyphens).\nKeep under 50 characters.\nOptionally prefix with a type: feat/, fix/, refactor/, docs/, chore/.\nBe descriptive but concise.\nOutput ONLY the branch name. No code fences. No explanation.";

export const DEFAULT_PR_TITLE_INSTRUCTIONS =
  "Keep under 70 characters.\nStart with a verb (Add, Fix, Update, Refactor, etc.).\nBe descriptive but concise.";

export const DEFAULT_PR_DESCRIPTION_INSTRUCTIONS =
  "Start with a brief summary (2-3 sentences max).\nInclude a bulleted list of key changes.\nKeep it concise but informative.";

// Returns the saved instructions, or the default text when nothing is saved.
// Used by the global editors so the default is visible and directly editable.
export function withDefault(
  read: () => Promise<string>,
  fallback: string,
): () => Promise<string> {
  return async () => {
    const saved = await read();
    return saved && saved.trim() ? saved : fallback;
  };
}
