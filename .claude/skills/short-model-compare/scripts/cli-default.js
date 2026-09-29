#!/usr/bin/env node
// node cli-default.js save|restore <backup> <claude|cursor>
// A take changes the user's default model for new sessions: picking a model or
// level in lpm's composer runs Claude Code's /model and /effort, which save
// "model" and "modelSettings.<id>.effortLevel" in ~/.claude/settings.json, and
// launching Cursor CLI with --model saves it in ~/.cursor/cli-config.json.
// `save` sets the file aside before a take (never over a backup a crashed take
// left); `restore` puts those keys back and keeps anything else that changed.
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLIS = {
  claude: { file: path.join(os.homedir(), ".claude", "settings.json"), keys: ["model", "modelSettings"] },
  cursor: {
    file: path.join(os.homedir(), ".cursor", "cli-config.json"),
    keys: ["model", "hasChangedDefaultModel", "maxMode", "modelParameters", "selectedModel", "modelSelectionHistory"],
  },
};

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
const canonical = (v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
        .join(",")}}`
    : JSON.stringify(v);

function save(backup, cli) {
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify({ text: read(CLIS[cli].file) }));
}

function restore(backup, cli) {
  if (!fs.existsSync(backup)) return;
  const { file, keys } = CLIS[cli];
  const { text } = JSON.parse(fs.readFileSync(backup, "utf8"));
  const now = read(file);
  if (now !== text) {
    const before = text ? JSON.parse(text) : {};
    const after = now ? JSON.parse(now) : {};
    for (const k of keys) {
      if (k in before) after[k] = before[k];
      else delete after[k];
    }
    if (canonical(after) === canonical(before) && text != null) fs.writeFileSync(file, text);
    else fs.writeFileSync(file, JSON.stringify(after, null, 2) + "\n");
  }
  fs.unlinkSync(backup);
}

module.exports = { save, restore };

if (require.main === module) {
  const [cmd, backup, cli = "claude"] = process.argv.slice(2);
  if (!["save", "restore"].includes(cmd) || !backup || !CLIS[cli]) {
    console.error("usage: node cli-default.js save|restore <backup> <claude|cursor>");
    process.exit(1);
  }
  (cmd === "save" ? save : restore)(backup, cli);
}
