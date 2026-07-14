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
  const emoji = lower.startsWith("test")
    ? "🧪"
    : lower === "build"
      ? "📦"
      : lower === "lint"
        ? "✨"
        : "🔧";
  const text = `${name} ${cmd}`;
  return {
    id,
    emoji,
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
    emoji: "🔧",
    name: capitalize(rawName),
    cmd,
    runMode: inferRunMode(text) ?? "once",
    confirm: shouldConfirm(text),
  };
}

// Turns scanned project sources into template-shaped suggestions: package.json
// scripts first, then Makefile targets, justfile recipes, and a compose entry.
// Deduped by command and capped so the gallery stays scannable.
export function buildSuggestions(sources: SuggestionSources): ActionTemplate[] {
  const pm = detectPackageManager(sources.locks);
  const candidates: ActionTemplate[] = [
    ...sources.scripts.map((name) => scriptSuggestion(name, pm)),
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
