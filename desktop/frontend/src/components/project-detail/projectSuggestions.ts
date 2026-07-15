import { slugify } from "../../slugify";
import { inferRunMode, shouldConfirm, type RunMode } from "./actionInference";
import type { ActionConfigLayer } from "../../actionConfig";

export interface ActionTemplate {
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

export interface LockPresence {
  bun: boolean;
  pnpm: boolean;
  yarn: boolean;
  npm: boolean;
}

export interface SuggestionSources {
  scripts: string[];
  makeTargets: string[];
  justRecipes: string[];
  hasCompose: boolean;
  hasClaude: boolean;
  hasCodex: boolean;
  hasGemini: boolean;
  hasOpencode: boolean;
  hasCargo: boolean;
  hasGoMod: boolean;
  hasPyproject: boolean;
  hasUvLock: boolean;
  locks: LockPresence;
}

const MAX_SUGGESTIONS = 9;

export function detectPackageManager(
  locks: LockPresence,
): "npm" | "yarn" | "pnpm" | "bun" {
  if (locks.bun) return "bun";
  if (locks.pnpm) return "pnpm";
  if (locks.yarn) return "yarn";
  return "npm";
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

// Ordered emoji rules for scanned scripts, targets, and recipes. First matching
// token (as a substring of the lowercased name) wins; 🔧 is the fallback.
const EMOJI_RULES: Array<[string, string]> = [
  ["clean", "🧹"],
  ["prettier", "🎨"],
  ["format", "🎨"],
  ["typecheck", "🔍"],
  ["check-types", "🔍"],
  ["tsc", "🔍"],
  ["check", "🔍"],
  ["storybook", "📖"],
  ["playwright", "🎭"],
  ["cypress", "🎭"],
  ["e2e", "🎭"],
  ["ios", "📱"],
  ["android", "🤖"],
  ["migrate", "🗃️"],
  ["db", "🗃️"],
  ["data", "🗃️"],
  ["deploy", "🚢"],
  ["release", "🚢"],
  ["publish", "🚢"],
  ["docs", "📚"],
  ["dev", "🚀"],
  ["start", "🚀"],
  ["test", "🧪"],
  ["build", "📦"],
  ["lint", "✨"],
];

function pickEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [token, emoji] of EMOJI_RULES) {
    if (lower.includes(token)) return emoji;
  }
  return "🔧";
}

// Returns the script names declared in a package.json's `scripts` map. Malformed
// JSON or a missing/invalid scripts field yields no suggestions rather than
// throwing.
export function parsePackageJsonScripts(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return [];
  }
  return Object.keys(scripts as Record<string, unknown>).filter((name) =>
    name.trim(),
  );
}

// Extracts real Makefile targets, skipping .PHONY, pattern rules, variable
// assignments, recipe bodies (indented), and file-path / dotfile targets.
export function parseMakefileTargets(content: string): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.startsWith("#")) continue;
    const match = /^([^:#=]+):(?!=)/.exec(line);
    if (!match) continue;
    for (const target of match[1].trim().split(/\s+/)) {
      if (
        !target ||
        target.startsWith(".") ||
        target.includes("/") ||
        target.includes("%")
      ) {
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      targets.push(target);
    }
  }
  return targets;
}

// Extracts top-level justfile recipe names, skipping comments, attributes,
// settings/assignments (`:=`, `set`, `export`, `alias`, ...), and indented
// recipe bodies.
export function parseJustfileRecipes(content: string): string[] {
  const recipes: string[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s/.test(line)) continue;
    const trimmed = line.trimEnd();
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("[") ||
      trimmed.includes(":=") ||
      /^(set|export|alias|import|mod)\b/.test(trimmed)
    ) {
      continue;
    }
    const match = /^@?([A-Za-z_][A-Za-z0-9_-]*)(\s+[^:]*)?:/.exec(trimmed);
    if (!match) continue;
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    recipes.push(name);
  }
  return recipes;
}

function scriptSuggestion(name: string, pm: string): ActionTemplate {
  const cmd = `${pm} run ${name}`;
  const id = `scan-${slugify(cmd)}`;
  const label = capitalize(name);
  const lower = name.toLowerCase();
  if (lower === "dev" || lower === "start") {
    return { id, emoji: "🚀", name: label, cmd, runMode: "terminal", reuse: true };
  }
  const text = `${name} ${cmd}`;
  return {
    id,
    emoji: pickEmoji(name),
    name: label,
    cmd,
    runMode: inferRunMode(text) ?? "once",
    confirm: shouldConfirm(text),
  };
}

function commandSuggestion(rawName: string, cmd: string): ActionTemplate {
  const text = `${rawName} ${cmd}`;
  return {
    id: `scan-${slugify(cmd)}`,
    emoji: pickEmoji(rawName),
    name: capitalize(rawName),
    cmd,
    runMode: inferRunMode(text) ?? "once",
    confirm: shouldConfirm(text),
  };
}

function ecosystemTemplate(
  name: string,
  cmd: string,
  runMode: RunMode,
  emoji: string,
  reuse = false,
): ActionTemplate {
  return { id: `scan-${slugify(cmd)}`, emoji, name, cmd, runMode, reuse };
}

// Default commands for non-npm ecosystems detected by manifest file. Run/Test/
// Build for Cargo and Go; a single Test entry for Python (uv-aware).
function ecosystemSuggestions(sources: SuggestionSources): ActionTemplate[] {
  const suggestions: ActionTemplate[] = [];
  if (sources.hasCargo) {
    suggestions.push(
      ecosystemTemplate("Run", "cargo run", "terminal", "🚀", true),
      ecosystemTemplate("Test", "cargo test", "once", "🧪"),
      ecosystemTemplate("Build", "cargo build", "once", "📦"),
    );
  }
  if (sources.hasGoMod) {
    suggestions.push(
      ecosystemTemplate("Run", "go run .", "terminal", "🚀", true),
      ecosystemTemplate("Test", "go test ./...", "once", "🧪"),
      ecosystemTemplate("Build", "go build ./...", "once", "📦"),
    );
  }
  if (sources.hasPyproject) {
    suggestions.push(
      ecosystemTemplate(
        "Test",
        sources.hasUvLock ? "uv run pytest" : "pytest",
        "once",
        "🧪",
      ),
    );
  }
  return suggestions;
}

// Turns scanned project sources into template-shaped suggestions: package.json
// scripts first, then non-npm ecosystem defaults (Cargo/Go/Python), Makefile
// targets, justfile recipes, and a compose entry. AI agents lead the list.
// Deduped by command and capped so the gallery stays scannable.
export function buildSuggestions(sources: SuggestionSources): ActionTemplate[] {
  const pm = detectPackageManager(sources.locks);
  // AI coding agents lead the list: running them beside services is lpm's core
  // purpose, and prepending keeps them ahead of the MAX_SUGGESTIONS cap and
  // inside the visible window of the "Suggested for this project" section.
  const aiAgents: ActionTemplate[] = [];
  if (sources.hasClaude) {
    aiAgents.push({
      id: "scan-claude",
      emoji: "🤖",
      name: "Claude Code",
      cmd: "claude",
      runMode: "terminal",
    });
  }
  if (sources.hasCodex) {
    aiAgents.push({
      id: "scan-codex",
      emoji: "🤖",
      name: "Codex",
      cmd: "codex",
      runMode: "terminal",
    });
  }
  if (sources.hasGemini) {
    aiAgents.push({
      id: "scan-gemini",
      emoji: "🤖",
      name: "Gemini",
      cmd: "gemini",
      runMode: "terminal",
    });
  }
  if (sources.hasOpencode) {
    aiAgents.push({
      id: "scan-opencode",
      emoji: "🤖",
      name: "OpenCode",
      cmd: "opencode",
      runMode: "terminal",
    });
  }
  const candidates: ActionTemplate[] = [
    ...aiAgents,
    ...sources.scripts.map((name) => scriptSuggestion(name, pm)),
    ...ecosystemSuggestions(sources),
    ...sources.makeTargets.map((target) =>
      commandSuggestion(target, `make ${target}`),
    ),
    ...sources.justRecipes.map((recipe) =>
      commandSuggestion(recipe, `just ${recipe}`),
    ),
  ];
  if (sources.hasCompose) {
    candidates.push({
      id: "scan-docker-compose-up",
      emoji: "🐳",
      name: "Docker up",
      cmd: "docker compose up -d",
      runMode: "once",
    });
  }

  const seen = new Set<string>();
  const deduped: ActionTemplate[] = [];
  for (const suggestion of candidates) {
    if (seen.has(suggestion.cmd)) continue;
    seen.add(suggestion.cmd);
    deduped.push(suggestion);
  }
  return deduped.slice(0, MAX_SUGGESTIONS);
}

// Static-template ids mapped to the script/target names a project suggestion
// would cover. A static template is dropped when a suggestion already does the
// same job, so the two grids don't show duplicate Build/Dev/Test cards.
const STATIC_TEMPLATE_JOBS: Record<string, string[]> = {
  dev: ["dev", "start"],
  tests: ["test", "pytest"],
  build: ["build"],
  lint: ["lint"],
  migrate: ["migrate"],
  deploy: ["deploy"],
  install: ["install"],
};

function cmdTokens(cmd: string): string[] {
  return cmd.trim().split(/\s+/).filter(Boolean);
}

// Drops static templates already covered by a project suggestion. A job matches
// when it equals any whitespace-separated token of the suggestion command (so
// `go build ./...` and `uv run pytest` count, not just the last word), or when
// the whole command is identical (e.g. the compose `docker compose up -d`).
export function filterStaticTemplates(
  staticTemplates: ActionTemplate[],
  suggestions: ActionTemplate[],
): ActionTemplate[] {
  const suggestionTokens = new Set(suggestions.flatMap((s) => cmdTokens(s.cmd)));
  const suggestionCmds = new Set(suggestions.map((s) => s.cmd.trim()));
  return staticTemplates.filter((template) => {
    if (suggestionCmds.has(template.cmd.trim())) return false;
    const jobs = STATIC_TEMPLATE_JOBS[template.id];
    if (!jobs) return true;
    return !jobs.some((job) => suggestionTokens.has(job));
  });
}
