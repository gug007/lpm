// Whether a recorded agent has answered, read from its own transcript files
// rather than the screen. Only entries stamped at or after `since` count, so a
// second prompt in the same session, or a forked session that copied an old
// transcript, never passes on an earlier answer.
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLAUDE_HOME = path.join(os.homedir(), ".claude");

// `~/.claude/projects/<root with every non-alphanumeric character as '-'>`,
// or the same under a lesson's own account `configDir`.
const claudeProjectDir = (root, configDir = CLAUDE_HOME) => path.join(configDir, "projects", root.replace(/[^a-zA-Z0-9]/g, "-"));

const squash = (t) => String(t).replace(/\s+/g, " ").trim().toLowerCase();

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((c) => c.type === "text").map((c) => c.text || "").join(" ");
  return "";
}

// Transcript entries of every session in `root` touched since `since`, in
// time order.
function claudeEntries(root, { since, configDir } = {}) {
  const dir = claudeProjectDir(root, configDir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).mtimeMs < since - 1000) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const at = Date.parse(entry.timestamp);
      if (Number.isFinite(at) && at >= since - 500) out.push({ ...entry, at, session: name });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// The turn after `since` — or after the user message carrying `prompt`, when
// given: whether the prompt arrived, the assistant has written text, and the
// turn has ended (end_turn).
function claudeTurn(root, { since, configDir, prompt } = {}) {
  let entries = claudeEntries(root, { since, configDir });
  let prompted = true;
  if (prompt) {
    const want = squash(prompt).slice(0, 60);
    const i = entries.findIndex((e) => e.type === "user" && squash(textOf(e.message?.content)).includes(want));
    prompted = i >= 0;
    entries = prompted ? entries.slice(i + 1).filter((e) => e.session === entries[i].session) : [];
  }
  const said = entries.filter((e) => e.type === "assistant");
  return {
    prompted,
    replied: said.some((e) => textOf(e.message?.content).trim()),
    done: said.some((e) => e.message?.stop_reason === "end_turn"),
  };
}

module.exports = { claudeProjectDir, claudeEntries, claudeTurn, CLAUDE_HOME };
