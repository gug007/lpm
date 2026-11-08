import { DOCS_PAGES, docsPath } from "@/lib/docs-pages";
import { FOOTER_GROUPS } from "@/lib/footer-links";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  FEATURES_PATH,
  GIT_TERMINAL_MAC_PATH,
  LIMIT_CALCULATOR_PATH,
  LINUX_HOST_PATH,
  MAC_MINI_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  PROJECT_SIDEBAR_PATH,
  REVIEW_CHANGES_PATH,
  SHARE_TERMINAL_PATH,
  SKILLS_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

export type Reading = { href: string; label: string; kind: "Docs" | "Guide" };

// The docs and guides that cover what each lesson shows. Every lesson has to be
// listed, so a new one can't go up without somewhere to read on.
const READING: Record<YouTubeLessonId, string[]> = {
  "lpm-in-3-minutes": [FEATURES_PATH, docsPath("install")],
  "add-project": [docsPath("detection"), docsPath("project")],
  "start-project": [docsPath("services"), PROJECT_SIDEBAR_PATH],
  "edit-services": [docsPath("services"), docsPath("editor")],
  "switch-profiles": [docsPath("profiles")],
  "add-action": [docsPath("actions")],
  "dynamic-action-labels": [docsPath("actions")],
  "six-action-button-ideas": [docsPath("actions")],
  "action-zones": [docsPath("zones"), docsPath("actions")],
  "run-any-ai-coding-agent": [CONNECT_AGENTS_PATH, AI_AGENTS_PATH],
  "parallel-agents": [PARALLEL_PATH, WORKTREE_AGENTS_PATH],
  "run-agent-commands-in-one-click": [AI_AGENTS_PATH],
  "review-code-changes": [REVIEW_CHANGES_PATH, GIT_TERMINAL_MAC_PATH],
  "auto-pull-complete-guide": [GIT_TERMINAL_MAC_PATH],
  "manage-claude-code-codex-skills": [SKILLS_PATH],
  "organize-claude-code-codex-skills-folders": [SKILLS_PATH],
  "multiple-accounts": [CLAUDE_ACCOUNTS_PATH, TOKEN_USAGE_PATH],
  "accounts-switching": [CLAUDE_ACCOUNTS_PATH, LIMIT_CALCULATOR_PATH],
  "switch-claude-account-mid-session": [CLAUDE_ACCOUNTS_PATH],
  "claude-statusline": [STATUSLINE_PATH, TOKEN_USAGE_PATH],
  "codex-statusline": [STATUSLINE_PATH, TOKEN_USAGE_PATH],
  "create-an-automation": [AUTOMATIONS_PATH],
  "automations-that-ask-you-first": [AUTOMATIONS_PATH],
  "connect-iphone": [MOBILE_PATH],
  "claude-code-codex-remote-server": [LINUX_HOST_PATH],
  "keep-agents-running-on-server": [MAC_MINI_PATH, LINUX_HOST_PATH],
  "share-terminal-in-browser": [SHARE_TERMINAL_PATH],
  "sync-ignored-files": [MAC_MINI_PATH],
  "stop-mac-sleeping-while-agents-run": [MAC_MINI_PATH],
  "agents-other-computer": [MAC_MINI_PATH, LINUX_HOST_PATH],
};

const LABELS = new Map<string, Omit<Reading, "href">>([
  ...FOOTER_GROUPS.flatMap((group) =>
    group.links.map(
      ({ href, label }) => [href, { label, kind: "Guide" }] as const,
    ),
  ),
  ...DOCS_PAGES.map(
    ({ slug, title }) => [docsPath(slug), { label: title, kind: "Docs" }] as const,
  ),
]);

export function lessonReading(lesson: YouTubeLessonId): Reading[] {
  return READING[lesson].map((href) => {
    const entry = LABELS.get(href);
    if (!entry) throw new Error(`No label for ${href}, read on from ${lesson}`);
    return { href, ...entry };
  });
}
