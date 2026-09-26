#!/usr/bin/env node
// node claude-default.js save|restore <backup>
// Picking a model or level in lpm's composer runs Claude Code's /model and
// /effort, and Claude saves both as the user's default for new sessions in
// ~/.claude/settings.json ("model", "modelSettings.<id>.effortLevel"). `save`
// sets the file aside before a take (never over a backup a crashed take left);
// `restore` puts those two keys back and keeps anything else that changed.
const fs = require("fs");
const os = require("os");
const path = require("path");

const [cmd, backup] = process.argv.slice(2);
const FILE = path.join(os.homedir(), ".claude", "settings.json");
const KEYS = ["model", "modelSettings"];
if (!["save", "restore"].includes(cmd) || !backup) {
  console.error("usage: node claude-default.js save|restore <backup>");
  process.exit(1);
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
const canonical = (v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
        .join(",")}}`
    : JSON.stringify(v);

if (cmd === "save") {
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify({ text: read(FILE) }));
  process.exit(0);
}

if (!fs.existsSync(backup)) process.exit(0);
const { text } = JSON.parse(fs.readFileSync(backup, "utf8"));
const now = read(FILE);
if (now !== text) {
  const before = text ? JSON.parse(text) : {};
  const after = now ? JSON.parse(now) : {};
  for (const k of KEYS) {
    if (k in before) after[k] = before[k];
    else delete after[k];
  }
  if (canonical(after) === canonical(before) && text != null) fs.writeFileSync(FILE, text);
  else fs.writeFileSync(FILE, JSON.stringify(after, null, 2) + "\n");
}
fs.unlinkSync(backup);
