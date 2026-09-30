#!/usr/bin/env node
// node guard.js save|restore <backup>
// A take drives the real Claude Code, Codex and Cursor CLIs, and some of what
// it shows writes the user's own defaults: a model or effort pick in the
// composer runs /model and /effort, and the status-line pages write
// statusLine / status_line. take.sh saves these keys before every take and
// puts them back afterwards, leaving any other change to those files alone.
// `save` never replaces a backup a killed take left behind: take.sh restores
// that one first.
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = () => process.env.LESSON_GUARD_HOME || os.homedir();
const targets = () => [
  { name: "claude", file: path.join(home(), ".claude", "settings.json"), kind: "json", keys: ["model", "effortLevel", "modelSettings", "statusLine"] },
  {
    name: "codex",
    file: path.join(process.env.LESSON_GUARD_HOME ? path.join(home(), ".codex") : process.env.CODEX_HOME || path.join(home(), ".codex"), "config.toml"),
    kind: "toml",
    // The status line lives in [tui] (lpm's Codex status-line page writes it
    // there); the dotted and inline forms are covered at the top level.
    keys: {
      "": ["model", "model_reasoning_effort", "status_line", "tui", "tui.status_line", "tui.status_line_use_colors"],
      tui: ["status_line", "status_line_use_colors"],
    },
  },
  {
    name: "cursor",
    file: path.join(home(), ".cursor", "cli-config.json"),
    kind: "json",
    keys: ["model", "hasChangedDefaultModel", "maxMode", "modelParameters", "selectedModel", "modelSelectionHistory"],
  },
];

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
const tilde = (p) => p.replace(home(), "~");
const canonical = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

// Where a TOML line leaves the parser: inside a multi-line string (its
// delimiter) and how deep inside brackets.
function advance(line, ml, depth) {
  let i = 0;
  while (i < line.length) {
    if (ml) {
      const close = line.indexOf(ml, i);
      if (close < 0) return { ml, depth };
      i = close + 3;
      ml = null;
      continue;
    }
    const c = line[i];
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      ml = line.slice(i, i + 3);
      i += 3;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < line.length && line[i] !== c) i += c === '"' && line[i] === "\\" ? 2 : 1;
      i++;
    } else if (c === "#") {
      break;
    } else {
      if (c === "[") depth++;
      if (c === "]") depth--;
      i++;
    }
  }
  return { ml, depth };
}

// A TOML file's sections (the top level "" and each [table]) and each
// section's `key = value` entries with the lines they span. Headers and keys
// count only outside multi-line strings and brackets.
function tomlScan(text) {
  const lines = text.split("\n");
  const top = { name: "", header: -1, start: 0, end: lines.length, entries: new Map() };
  const sections = [top];
  let cur = top;
  let ml = null;
  let depth = 0;
  let entry = null;
  for (let i = 0; i < lines.length; i++) {
    if (!ml && depth <= 0) {
      const h = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(lines[i]);
      if (h) {
        cur.end = i;
        cur = { name: h[1], header: i, start: i + 1, end: lines.length, entries: new Map() };
        sections.push(cur);
        continue;
      }
      const k = /^\s*("[^"]*"|[A-Za-z0-9_.-]+)\s*=/.exec(lines[i]);
      if (k) entry = { key: k[1].replace(/^"|"$/g, ""), start: i };
    }
    ({ ml, depth } = advance(lines[i], ml, depth));
    if (entry && !ml && depth <= 0) {
      entry.end = i;
      entry.text = lines.slice(entry.start, i + 1).join("\n");
      if (!cur.entries.has(entry.key)) cur.entries.set(entry.key, entry);
      entry = null;
      depth = 0;
    }
  }
  return { lines, sections, section: (name) => sections.find((x) => x.name === name) };
}

// Puts back `keys` ({ "<section>": [key, …] }) as they were in `before`,
// leaving every other line of `now` alone.
function restoreToml(before, now, keys) {
  const was = tomlScan(before || "");
  let cur = tomlScan(now);
  const changed = [];
  for (const [name, list] of Object.entries(keys)) {
    for (const key of list) {
      const a = was.section(name)?.entries.get(key);
      const sec = cur.section(name);
      const b = sec?.entries.get(key);
      if ((a && a.text) === (b && b.text)) continue;
      changed.push(name ? `${name}.${key}` : key);
      const lines = cur.lines.slice();
      if (b && a) lines.splice(b.start, b.end - b.start + 1, ...a.text.split("\n"));
      else if (b) lines.splice(b.start, b.end - b.start + 1);
      else if (sec) {
        let at = sec.end;
        while (at > sec.start && !lines[at - 1].trim()) at--;
        lines.splice(at, 0, ...a.text.split("\n"));
      } else {
        while (lines.length && !lines.at(-1).trim()) lines.pop();
        lines.push("", `[${name}]`, ...a.text.split("\n"), "");
      }
      cur = tomlScan(lines.join("\n"));
    }
    // A table the take created and that is empty again goes too.
    const sec = cur.section(name);
    if (name && sec && !was.section(name) && !sec.entries.size && cur.lines.slice(sec.start, sec.end).every((l) => !l.trim())) {
      const lines = cur.lines.slice();
      const from = sec.header > 0 && !lines[sec.header - 1].trim() ? sec.header - 1 : sec.header;
      lines.splice(from, sec.end - from);
      cur = tomlScan(lines.join("\n"));
    }
  }
  const text = cur.lines.join("\n");
  return { text: now.endsWith("\n") && !text.endsWith("\n") ? `${text}\n` : text, changed };
}

function restoreJson(before, now, keys) {
  const was = before ? JSON.parse(before) : {};
  const after = JSON.parse(now);
  const changed = keys.filter((k) => canonical(was[k]) !== canonical(after[k]));
  for (const k of changed) {
    if (k in was) after[k] = was[k];
    else delete after[k];
  }
  if (before != null && canonical(after) === canonical(was)) return { text: before, changed };
  return { text: JSON.stringify(after, null, 2) + "\n", changed };
}

function save(backup) {
  if (fs.existsSync(backup)) return false;
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  const files = Object.fromEntries(targets().map((t) => [t.name, read(t.file)]));
  fs.writeFileSync(`${backup}.part`, JSON.stringify({ savedAt: new Date().toISOString(), files }), { mode: 0o600 });
  fs.renameSync(`${backup}.part`, backup);
  return true;
}

// Returns false when something could not be put back; the backup then stays
// (a file that no longer parses keeps its saved copy for a later attempt).
function restore(backup, log = console.log) {
  if (!fs.existsSync(backup)) return true;
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(backup, "utf8")).files || {};
  } catch (e) {
    const aside = `${backup}.unreadable-${Date.now()}`;
    fs.renameSync(backup, aside);
    log(`guard: the settings backup could not be read (${e.message}); moved it to ${aside}`);
    return false;
  }
  let ok = true;
  for (const t of targets()) {
    const before = saved[t.name] ?? null;
    const now = read(t.file);
    if (now === before || now == null) continue;
    let result;
    try {
      result = t.kind === "json" ? restoreJson(before, now, t.keys) : restoreToml(before, now, t.keys);
    } catch (e) {
      log(`guard: could not read ${tilde(t.file)} (${e.message}); left it as it is and kept the backup ${backup}`);
      ok = false;
      continue;
    }
    if (!result.changed.length) continue;
    fs.writeFileSync(t.file, result.text);
    log(`guard: put back ${result.changed.join(", ")} in ${tilde(t.file)}`);
  }
  if (ok) fs.unlinkSync(backup);
  return ok;
}

module.exports = { save, restore, tomlScan, restoreToml, restoreJson };

if (require.main === module) {
  const [cmd, backup] = process.argv.slice(2);
  if (!["save", "restore"].includes(cmd) || !backup) {
    console.error("usage: node guard.js save|restore <backup>");
    process.exit(2);
  }
  if (cmd === "save") {
    if (!save(backup)) {
      console.error(`guard: ${backup} is from an earlier take and was never put back; run \`node guard.js restore ${backup}\` first`);
      process.exit(1);
    }
  } else if (!restore(backup)) {
    process.exit(1);
  }
}
