#!/usr/bin/env node
// node models.js "opus 5.5 max" "gpt 6 astra ultra"
// Turns loose model specs into exact launch commands, checked against what
// the installed CLIs accept: Claude Code's own model table (read from its
// binary) and Codex's models cache (with each model's reasoning levels).
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

let codexCache;
function codexTable() {
  if (codexCache) return codexCache;
  const file = path.join(os.homedir(), ".codex", "models_cache.json");
  if (!fs.existsSync(file)) throw new Error(`no Codex models cache at ${file}: run codex once`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  codexCache = (data.models || data).map((m) => ({
    slug: m.slug,
    hidden: m.visibility === "hide",
    efforts: (m.supported_reasoning_levels || []).map((l) => (typeof l === "string" ? l : l.effort)),
  }));
  return codexCache;
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
  const pick = version
    ? inFamily.find((m) => m.name.toLowerCase() === `${family} ${version}`)
    : inFamily.slice().sort((a, b) => versionOf(b.name) - versionOf(a.name))[0];
  if (!pick) {
    const names = inFamily.map((m) => m.name).join(", ");
    throw new Error(`"${spec}": no ${title(family)} ${version} in Claude Code ${names ? `(it has ${names})` : ""}`);
  }
  if (effort && !efforts.includes(effort)) {
    throw new Error(`"${spec}": Claude Code effort is one of ${efforts.join(", ")}, not ${effort}`);
  }
  return { cli: "claude", model: pick.id, name: pick.name, effort };
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
  return { cli: "codex", model: m.slug, name: codexName(m.slug), effort };
}

function resolve(spec) {
  const raw = spec
    .toLowerCase()
    .replace(/\b(claude code|claude|codex|openai|anthropic)\b/g, " ")
    .replace(/[·,]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (raw.length === 0) throw new Error(`"${spec}": no model named`);
  const { words, effort } = splitEffort(raw);
  const claude = new Set(claudeTable().models.map((m) => m.family));
  const r = claude.has(words[0]) ? resolveClaude(words, effort, spec) : resolveCodex(words, effort, spec);
  const label = r.effort ? `${r.name} · ${r.effort}` : r.name;
  const cmd =
    r.cli === "claude"
      ? ["claude", "--model", r.model, r.effort && `--effort ${r.effort}`, "--permission-mode acceptEdits"]
      : ["codex", "-m", r.model, r.effort && `-c model_reasoning_effort=${r.effort}`, "-c check_for_update_on_startup=false"];
  return {
    ...r,
    label,
    headline: r.effort ? `${r.name} ${r.effort}` : r.name,
    spokenEffort: r.effort ? SPOKEN_EFFORT[r.effort] || r.effort : null,
    dir: `${r.name}${r.effort ? " " + r.effort : ""}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-"),
    emoji: r.cli === "claude" ? "✻" : "◆",
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
