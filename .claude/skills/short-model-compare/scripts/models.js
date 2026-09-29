#!/usr/bin/env node
// node models.js "opus 5.5 max" "gpt 6 astra ultra" "grok 4.7 xhigh"
// Turns loose model specs into exact launch commands, checked against what
// the installed CLIs accept: Claude Code's own model table (read from its
// binary), Codex's models cache (with each model's reasoning levels) and
// Cursor CLI's model list (`agent --list-models`, one slug per level).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const EFFORT_ALIASES = {
  utra: "ultra",
  ultr: "ultra",
  "x-high": "xhigh",
  "extra-high": "xhigh",
  extrahigh: "xhigh",
  med: "medium",
  mid: "medium",
  maximum: "max",
};
const SPOKEN_EFFORT = { xhigh: "extra high" };

function which(bin) {
  try {
    return fs.realpathSync(execFileSync("which", [bin], { encoding: "utf8" }).trim());
  } catch {
    return null;
  }
}

let claudeCache;
function claudeTable() {
  if (claudeCache) return claudeCache;
  const bin = which("claude");
  if (!bin) throw new Error("claude is not on PATH");
  const text = fs.readFileSync(bin).toString("latin1");
  const re = /\{id:"(claude-[a-z0-9-]+)",family:"([a-z]+)",display_name:"([^"]+)"[^}]*?provider_ids:\{first_party:"([^"]+)"/g;
  const models = new Map();
  for (const m of text.matchAll(re)) models.set(m[1], { family: m[2], name: m[3], id: m[4] });
  let efforts = ["low", "medium", "high", "xhigh", "max"];
  try {
    const help = execFileSync(bin, ["--help"], { encoding: "utf8" });
    const list = /--effort <level>[\s\S]*?\(([^)]+)\)/.exec(help)?.[1];
    if (list) efforts = list.split(",").map((e) => e.trim());
  } catch {}
  claudeCache = { models: [...models.values()], efforts };
  return claudeCache;
}

const CODEX_CACHE = path.join(os.homedir(), ".codex", "models_cache.json");

let codexCache;
function codexTable() {
  if (codexCache) return codexCache;
  if (!fs.existsSync(CODEX_CACHE)) throw new Error(`no Codex models cache at ${CODEX_CACHE}: run codex once`);
  const data = JSON.parse(fs.readFileSync(CODEX_CACHE, "utf8"));
  codexCache = (data.models || data).map((m) => ({
    slug: m.slug,
    hidden: m.visibility === "hide",
    efforts: (m.supported_reasoning_levels || []).map((l) => (typeof l === "string" ? l : l.effort)),
  }));
  return codexCache;
}

const CURSOR_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

let cursorCache;
function cursorTable() {
  if (cursorCache) return cursorCache;
  if (!which("agent")) throw new Error("Cursor CLI (agent) is not on PATH: curl https://cursor.com/install -fsS | bash");
  const out = execFileSync("agent", ["--list-models"], { encoding: "utf8" });
  cursorCache = [...out.matchAll(/^(\S+) - (.+)$/gm)].map((m) => ({
    slug: m[1],
    display: m[2].replace(/[​-‍﻿]/g, "").replace(/\s*\(.*\)$/, "").trim(),
  }));
  return cursorCache;
}

const versionOf = (name) => Number((/(\d+(?:\.\d+)?)\s*$/.exec(name) || [])[1] || 0);
const title = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function codexName(slug) {
  const m = /^gpt-([\d.]+)(?:-(.+))?$/.exec(slug);
  if (!m) return slug.split("-").map(title).join(" ");
  return `GPT-${m[1]}${m[2] ? " " + m[2].split("-").map(title).join(" ") : ""}`;
}

function splitEffort(words) {
  const last = words.at(-1);
  const effort = EFFORT_ALIASES[last] || last;
  const known = new Set(["minimal", "low", "medium", "high", "xhigh", "max", "ultra", "none"]);
  return known.has(effort) ? { words: words.slice(0, -1), effort } : { words, effort: null };
}

function resolveClaude(words, effort, spec) {
  const { models, efforts } = claudeTable();
  const family = words[0];
  const version = words.slice(1).join(".").replace(/-/g, ".").replace(/\.+/g, ".");
  const inFamily = models.filter((m) => m.family === family);
  if (inFamily.length === 0) throw new Error(`"${spec}": Claude Code knows no "${family}" models`);
  const newest = inFamily.slice().sort((a, b) => versionOf(b.name) - versionOf(a.name))[0];
  const pick = version ? inFamily.find((m) => m.name.toLowerCase() === `${family} ${version}`) : newest;
  if (!pick) {
    const names = inFamily.map((m) => m.name).join(", ");
    throw new Error(`"${spec}": no ${title(family)} ${version} in Claude Code ${names ? `(it has ${names})` : ""}`);
  }
  if (effort && !efforts.includes(effort)) {
    throw new Error(`"${spec}": Claude Code effort is one of ${efforts.join(", ")}, not ${effort}`);
  }
  // lpm's per-run model picker offers each family by its bare name, which
  // Claude Code resolves to the family's newest model.
  return { cli: "claude", model: pick.id, name: pick.name, effort, pickerModel: pick === newest ? title(family) : null };
}

function resolveCodex(words, effort, spec) {
  const models = codexTable();
  const joined = words.join(" ").replace(/^gpt[\s-]*/, "gpt-").replace(/\s+/g, "-");
  let hits = models.filter((m) => m.slug === joined);
  if (hits.length === 0) hits = models.filter((m) => m.slug.endsWith(`-${joined}`) || m.slug.startsWith(`${joined}-`));
  if (hits.length > 1) hits = hits.filter((m) => !m.hidden);
  if (hits.length !== 1) {
    const list = (hits.length ? hits : models.filter((m) => !m.hidden)).map((m) => m.slug).join(", ");
    throw new Error(`"${spec}": ${hits.length ? "ambiguous" : "unknown"} Codex model; pick one of ${list}`);
  }
  const m = hits[0];
  if (effort && !m.efforts.includes(effort)) {
    throw new Error(`"${spec}": ${m.slug} supports ${m.efforts.join(", ")}, not ${effort} (an unsupported level fails mid-run)`);
  }
  return { cli: "codex", model: m.slug, name: codexName(m.slug), effort, pickerModel: codexName(m.slug) };
}

// Cursor names each level as its own slug (`grok-4.7-xhigh`, some with a
// `cursor-` prefix); the `-fast` variants are left out, and so are the Claude
// and GPT models it lists, which run in their own CLIs.
function resolveCursor(words, effort, spec) {
  const models = cursorTable().filter((m) => !/^(claude|gpt)-/.test(m.slug));
  const joined = words.join("-");
  const base = (slug) => slug.replace(/^cursor-/, "");
  const levels = models.filter((m) => new RegExp(`^${joined.replace(/\./g, "\\.")}-(${CURSOR_EFFORTS.join("|")})$`).test(base(m.slug)));
  const pick = effort
    ? levels.find((m) => base(m.slug) === `${joined}-${effort}`)
    : models.find((m) => base(m.slug) === joined);
  if (!pick) {
    const efforts = levels.map((m) => base(m.slug).slice(joined.length + 1));
    if (efforts.length && effort) throw new Error(`"${spec}": Cursor has ${joined} at ${efforts.join(", ")}, not ${effort}`);
    if (efforts.length) throw new Error(`"${spec}": Cursor has no bare ${joined}; add a level (${efforts.join(", ")})`);
    if (effort && models.some((m) => base(m.slug) === joined)) {
      throw new Error(`"${spec}": Cursor has ${joined} at one level only; leave ${effort} off`);
    }
    const list = [
      ...new Set(models.map((m) => base(m.slug).replace(/-fast$/, "").replace(new RegExp(`-(${CURSOR_EFFORTS.join("|")})$`), ""))),
    ];
    throw new Error(`"${spec}": unknown Cursor model; pick one of ${list.join(", ")}`);
  }
  const name = pick.display
    .replace(/\b(Extra High|Minimal|Low|Medium|High|Max|Fast)\b/g, "")
    .replace(/\b\d+[KM]\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { cli: "cursor", model: pick.slug, name, effort, pickerModel: null };
}

// The word viewers search for ("claude vs grok"), not the CLI running it: a
// Cursor model goes by its own name, except Cursor's own Composer.
function brandOf(r) {
  if (r.cli === "claude") return "Claude";
  if (r.cli === "codex") return "ChatGPT";
  const first = r.name.split(" ")[0];
  return first.toLowerCase() === "composer" ? "Cursor" : first;
}

// A GPT model, or a word naming one of Codex's models ("astra").
const isCodexModel = (word) =>
  word.startsWith("gpt") || (fs.existsSync(CODEX_CACHE) && codexTable().some((m) => !m.hidden && m.slug.split("-").includes(word)));

function resolve(spec) {
  const raw = spec
    .toLowerCase()
    .replace(/\b(claude code|claude|codex|openai|anthropic|cursor|in)\b/g, " ")
    .replace(/[·,]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (raw.length === 0) throw new Error(`"${spec}": no model named`);
  const { words, effort } = splitEffort(raw);
  // Claude models run in Claude Code and GPT models in Codex, even though
  // Cursor lists both; every other model runs in Cursor CLI.
  const claude = new Set(claudeTable().models.map((m) => m.family));
  const r = claude.has(words[0])
    ? resolveClaude(words, effort, spec)
    : isCodexModel(words[0])
      ? resolveCodex(words, effort, spec)
      : resolveCursor(words, effort, spec);
  const label = r.effort ? `${r.name} · ${r.effort}` : r.name;
  // Cursor gets the prompt as its launch argument (beats.js), which it
  // submits once it is up; --trust skips the new folder's trust prompt, and
  // --force lets its shell calls run, as Codex's sandbox does, rather than
  // stop the race on an approval.
  const cmd = {
    claude: ["claude", "--model", r.model, r.effort && `--effort ${r.effort}`, "--permission-mode acceptEdits"],
    codex: ["codex", "-m", r.model, r.effort && `-c model_reasoning_effort=${r.effort}`, "-c check_for_update_on_startup=false"],
    cursor: ["agent", "--model", r.model, "--trust", "--force"],
  }[r.cli];
  return {
    ...r,
    label,
    brand: brandOf(r),
    headline: r.effort ? `${r.name} ${r.effort}` : r.name,
    spokenEffort: r.effort ? SPOKEN_EFFORT[r.effort] || r.effort : null,
    pickerEffort: r.effort ? (r.effort === "xhigh" ? "Extra High" : title(r.effort)) : null,
    dir: `${r.name}${r.effort ? " " + r.effort : ""}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-"),
    emoji: { claude: "✻", codex: "◆", cursor: "⬢" }[r.cli],
    cmd: cmd.filter(Boolean).join(" "),
  };
}

module.exports = { resolve };

if (require.main === module) {
  const specs = process.argv.slice(2);
  if (specs.length === 0) {
    console.error('usage: node models.js "opus 5.5 max" "gpt 6 astra ultra"');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(specs.map(resolve), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
