const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { restoreJson, restoreToml } = require("../guard");
const { parseCli, lessonDir } = require("../cli");
const { checkDataDir, hasLpmDir } = require("../state");
const { hostEnv } = require("../app");
const { claudeTurn } = require("../agents");

test("the guard puts back only the agent defaults and keeps other edits", () => {
  const before = JSON.stringify({ model: "opus", theme: "dark" }, null, 2) + "\n";
  const now = JSON.stringify({ model: "sonnet", theme: "dark", effortLevel: "high", statusLine: { type: "command" }, extra: 1 });
  const r = restoreJson(before, now, ["model", "effortLevel", "modelSettings", "statusLine"]);
  assert.deepStrictEqual(JSON.parse(r.text), { model: "opus", theme: "dark", extra: 1 });
  assert.deepStrictEqual(r.changed.sort(), ["effortLevel", "model", "statusLine"]);
  assert.strictEqual(restoreJson(before, JSON.stringify({ model: "sonnet", theme: "dark" }), ["model"]).text, before);
});

test("the guard restores Codex's model and its [tui] status line, and nothing else", () => {
  const keys = { "": ["model", "model_reasoning_effort", "status_line", "tui"], tui: ["status_line", "status_line_use_colors"] };
  const before = 'model = "gpt-6"\nnotes = """\n[ ] a markdown box\n"""\n\n[tui]\nstatus_line = ["model"]\n\n[projects."/a"]\ntrust_level = "trusted"\n';
  const now = 'model = "gpt-6-sol"\nnotes = """\n[ ] a markdown box\n"""\n\n[tui]\nstatus_line = [\n  "model",\n  "context",\n]\nstatus_line_use_colors = false\n\n[projects."/a"]\ntrust_level = "trusted"\n\n[projects."/b"]\ntrust_level = "trusted"\n';
  const r = restoreToml(before, now, keys);
  assert.strictEqual(r.text, 'model = "gpt-6"\nnotes = """\n[ ] a markdown box\n"""\n\n[tui]\nstatus_line = ["model"]\n\n[projects."/a"]\ntrust_level = "trusted"\n\n[projects."/b"]\ntrust_level = "trusted"\n');
  assert.deepStrictEqual(r.changed, ["model", "tui.status_line", "tui.status_line_use_colors"]);
  const created = restoreToml('model = "x"\n', 'model = "x"\n\n[tui]\nstatus_line = ["a"]\n', keys);
  assert.strictEqual(created.text, 'model = "x"\n');
});

test("flags are strict and a lesson path is never looked up again by name", () => {
  assert.throws(() => parseCli(["x", "--mux-onyl"], { script: "make.js" }), /Unknown option '--mux-onyl'/);
  assert.throws(() => parseCli(["x", "--take", "3"], { script: "make.js" }), /add --mux-only/);
  assert.throws(() => parseCli(["x", "--lpm-dir", "rel"], { script: "make.js" }), /absolute path/);
  assert.deepStrictEqual({ ...parseCli(["/tmp/l", "--mux-only", "--take", "3"], { script: "make.js" }).o }, { "mux-only": true, take: "3" });
  assert.strictEqual(lessonDir("/scratch/14-x", "/root"), "/scratch/14-x");
  assert.strictEqual(lessonDir("14-x", "/root"), "/root/14-x");
});

test("only a lesson data directory is ever wiped", () => {
  const home = os.homedir();
  assert.throws(() => checkDataDir(path.join(home, ".lpm")), /real/);
  assert.throws(() => checkDataDir(path.join(home, ".lpm", "x")), /real/);
  assert.throws(() => checkDataDir(home), /holds the real/);
  assert.throws(() => checkDataDir("/etc/lpm"), /pick one under your home/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-dir-"));
  fs.writeFileSync(path.join(tmp, "notes.txt"), "mine");
  assert.throws(() => checkDataDir(tmp), /not a lesson data directory/);
  fs.writeFileSync(path.join(tmp, ".lesson-data-dir"), "");
  assert.strictEqual(checkDataDir(tmp), tmp);
  assert.strictEqual(checkDataDir(path.join(tmp, "new")), path.join(tmp, "new"));
  fs.rmSync(tmp, { recursive: true });
  assert.ok(hasLpmDir("A=1 LPM_DIR=/u/.lpm-lessons B=2", "/u/.lpm-lessons"));
  assert.ok(!hasLpmDir("LPM_DIR=/u/.lpm-lessons-2", "/u/.lpm-lessons"));
});

test("the lesson app never inherits a session, an account dir or API keys", () => {
  const env = hostEnv({ PATH: "/bin", CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", CLAUDE_CONFIG_DIR: "/x", LPM_DIR: "/y", OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "k", CURSOR_API_KEY: "k", HOME: "/h" });
  assert.deepStrictEqual(env, { PATH: "/bin", HOME: "/h" });
});

test("an agent reply counts only after the prompt it answers", () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-claude-"));
  const dir = path.join(configDir, "projects", "-w-p");
  fs.mkdirSync(dir, { recursive: true });
  const at = (s) => new Date(Date.parse("2026-09-29T10:00:00Z") + s * 1000).toISOString();
  const entries = [
    { type: "user", timestamp: at(0), message: { content: "first question" } },
    { type: "assistant", timestamp: at(5), message: { content: [{ type: "text", text: "first answer" }], stop_reason: "end_turn" } },
    { type: "user", timestamp: at(60), message: { content: "second question" } },
  ];
  fs.writeFileSync(path.join(dir, "s.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const since = Date.parse(at(59));
  assert.deepStrictEqual(claudeTurn("/w/p", { since, configDir }), { prompted: true, replied: false, done: false });
  assert.deepStrictEqual(claudeTurn("/w/p", { since, configDir, prompt: "second question" }), { prompted: true, replied: false, done: false });
  fs.appendFileSync(path.join(dir, "s.jsonl"), JSON.stringify({ type: "assistant", timestamp: at(64), message: { content: [{ type: "text", text: "second answer" }], stop_reason: "end_turn" } }) + "\n");
  assert.deepStrictEqual(claudeTurn("/w/p", { since, configDir, prompt: "second question" }), { prompted: true, replied: true, done: true });
  fs.rmSync(configDir, { recursive: true });
});
