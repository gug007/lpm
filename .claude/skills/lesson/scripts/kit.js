// Shared seeding, typing and agent helpers for lesson beats (landscape and
// vertical). A lesson requires it by absolute path:
// require("<repo>/.claude/skills/lesson/scripts/kit").
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { claudeTurn } = require("./agents");

const LESSONS = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies", "lpm-lessons");
const LEDGER = path.join(LESSONS, "_trust-ledger.json");

const PROJECT = (name) => `nav >> text=${name}`;
const HEADER = (name) => `[data-actions-group="header"] >> button:has-text("${name}")`;
const TABS = "button.h-6.font-mono";
const COMPOSER_INPUT = '[data-composer-box] >> [role="textbox"]';
const SEND = '[data-composer-box] >> button[aria-label="Send"]';

const storefrontServer = `const http = require("node:http");

const port = Number(process.env.PORT) || 5173;
const products = [
  { name: "Espresso beans", price: 14 },
  { name: "Pour-over kettle", price: 39 },
  { name: "Ceramic dripper", price: 22 },
];

const page = \`<!doctype html><title>storefront</title>
<h1>Welcome to our coffee shop</h1>
<ul>\${products.map((p) => \`<li>\${p.name} $\${p.price}</li>\`).join("")}</ul>\`;

http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  })
  .listen(port, () => console.log(\`storefront on http://localhost:\${port}\`));
`;

function git(root, ...args) {
  execFileSync("git", ["-c", "user.name=storefront", "-c", "user.email=dev@example.com", ...args], {
    cwd: root,
    stdio: "ignore",
  });
}

// A project folder under <workspace>/Projects and its lpm config. `files`
// overrides the default one-file server; `services` defaults to one web
// service on `port`.
function writeProject(lpmDir, workspace, { name, port = 3000, files, scripts, services, readme, gitInit = true }) {
  const root = path.join(workspace, "Projects", name);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  const pkg = { name, version: "1.0.0", private: true, scripts: scripts || { dev: `PORT=${port} node src/server.js` } };
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  const body = files || {
    "src/server.js":
      name === "storefront"
        ? storefrontServer
        : `require("node:http").createServer((_, res) => res.end("${name}")).listen(process.env.PORT || ${port});\n`,
  };
  for (const [file, text] of Object.entries(body)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  fs.writeFileSync(
    path.join(root, "README.md"),
    readme || (name === "storefront" ? "# storefront\n\nA small online coffee shop. `npm run dev` serves the product page.\n" : `# ${name}\n`),
  );
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\n");
  if (gitInit) {
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "Initial commit");
  }
  const svc = services || [{ name: "web", cmd: "npm run dev", port }];
  const yml = svc
    .map((s) => [`  ${s.name}:`, `    cmd: ${s.cmd}`, s.port ? `    port: ${s.port}` : null].filter(Boolean).join("\n"))
    .join("\n");
  const dir = path.join(lpmDir, "projects");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.yml`), `name: ${name}\nroot: ${root}\n\nservices:\n${yml}\n`);
  return root;
}

// Both agent CLIs ask for a one-time folder trust in a folder they have not
// seen. The lesson shell puts `claude` and `codex` shims first on its PATH that
// record it, for folders under the workspace only, then run the real CLI; the
// ledger lets the next take remove it. Shims, not shell functions: lpm's own
// startup files define a `codex` function after the user's .zshrc, and it
// runs `command codex`.
const trustScript = (workspace) => `import fcntl, json, os, sys

cwd = sys.argv[1]
workspace = ${JSON.stringify(workspace)}
if not cwd.startswith(workspace + "/"):
    sys.exit(0)

lock = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "lesson-trust.lock"), "w")
fcntl.flock(lock, fcntl.LOCK_EX)

ledger_file = ${JSON.stringify(LEDGER)}
ledger = json.load(open(ledger_file)) if os.path.exists(ledger_file) else []

claude = os.path.join(os.environ["CLAUDE_CONFIG_DIR"], ".claude.json") if os.environ.get("CLAUDE_CONFIG_DIR") else os.path.expanduser("~/.claude.json")
data = json.load(open(claude))
projects = data.setdefault("projects", {})
if not projects.get(cwd, {}).get("hasTrustDialogAccepted"):
    entry = projects.get(cwd, {})
    entry.setdefault("allowedTools", [])
    entry["hasTrustDialogAccepted"] = True
    projects[cwd] = entry
    tmp = claude + ".lesson"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, claude)

codex = os.path.expanduser("~/.codex/config.toml")
text = open(codex).read() if os.path.exists(codex) else ""
header = '[projects."%s"]' % cwd
if header not in text:
    with open(codex, "a") as f:
        f.write("\\n%s\\ntrust_level = \\"trusted\\"\\n" % header)

if cwd not in ledger:
    ledger.append(cwd)
    with open(ledger_file, "w") as f:
        json.dump(ledger, f, indent=2)
`;

// The Claude configs a take's folder trust lands in: the user's own, and the
// account a take records on (LESSON_CLAUDE_CONFIG_DIR).
function claudeJsonFiles() {
  const dirs = [os.homedir(), process.env.LESSON_CLAUDE_CONFIG_DIR].filter(Boolean);
  return dirs.map((d) => path.join(d, ".claude.json")).filter((f) => fs.existsSync(f));
}

function pruneTrust() {
  if (!fs.existsSync(LEDGER)) return;
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const gone = ledger.filter((p) => !fs.existsSync(p));
  if (gone.length === 0) return;
  for (const claude of claudeJsonFiles()) {
    const data = JSON.parse(fs.readFileSync(claude, "utf8"));
    for (const p of gone) delete data.projects?.[p];
    fs.writeFileSync(claude + ".lesson", JSON.stringify(data, null, 2));
    fs.renameSync(claude + ".lesson", claude);
  }
  const codex = path.join(os.homedir(), ".codex", "config.toml");
  if (fs.existsSync(codex)) {
    let text = fs.readFileSync(codex, "utf8");
    for (const p of gone) text = text.replace(`\n[projects."${p}"]\ntrust_level = "trusted"\n`, "");
    fs.writeFileSync(codex, text);
  }
  fs.writeFileSync(LEDGER, JSON.stringify(ledger.filter((p) => fs.existsSync(p)), null, 2));
}

// Codex puts "⚠ 1 warning" under its prompt on every start when an MCP server's
// program is gone (a removed Codex.app leaves node_repl behind). Such servers
// are turned off for the take with a marked line, taken out again on exit and
// at the start of the next take.
const CODEX_CONFIG = path.join(os.homedir(), ".codex", "config.toml");
const MCP_OFF = "enabled = false # lpm-lesson";

function restoreCodexMcp() {
  if (!fs.existsSync(CODEX_CONFIG)) return;
  const text = fs.readFileSync(CODEX_CONFIG, "utf8");
  if (text.includes(MCP_OFF)) fs.writeFileSync(CODEX_CONFIG, text.split("\n").filter((l) => l.trim() !== MCP_OFF).join("\n"));
}

function quietCodexMcp() {
  restoreCodexMcp();
  if (!fs.existsSync(CODEX_CONFIG)) return [];
  const lines = fs.readFileSync(CODEX_CONFIG, "utf8").split("\n");
  const off = [];
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i].match(/^\[mcp_servers\.([\w-]+)\]\s*$/)?.[1];
    if (!name) continue;
    let end = i + 1;
    while (end < lines.length && !lines[end].startsWith("[")) end++;
    const body = lines.slice(i + 1, end);
    const command = body.map((l) => l.match(/^command\s*=\s*"(.*)"\s*$/)?.[1]).find(Boolean);
    if (body.some((l) => /^enabled\s*=/.test(l)) || !command || !path.isAbsolute(command) || fs.existsSync(command)) continue;
    lines.splice(i + 1, 0, MCP_OFF);
    off.push(name);
  }
  if (off.length) {
    fs.writeFileSync(CODEX_CONFIG, lines.join("\n"));
    process.on("exit", restoreCodexMcp);
  }
  return off;
}

// A project pane runs the user's own shell, whose prompt carries their account
// and machine name; the shims keep their setup and replace only the prompt.
function neutralShell(lpmDir, workspace) {
  pruneTrust();
  const dir = path.join(lpmDir, "zsh");
  fs.mkdirSync(dir, { recursive: true });
  for (const file of [".zshenv", ".zprofile", ".zlogin"]) {
    fs.writeFileSync(path.join(dir, file), `[[ -f "$HOME/${file}" ]] && source "$HOME/${file}"\n`);
  }
  const trust = path.join(lpmDir, "lesson-trust.py");
  fs.writeFileSync(trust, trustScript(workspace));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const cli of ["claude", "codex"]) {
    fs.writeFileSync(
      path.join(bin, cli),
      `#!/bin/zsh -f\n/usr/bin/python3 ${JSON.stringify(trust)} "$PWD"\npath=(\${path:#\${0:A:h}})\nexec ${cli} "$@"\n`,
      { mode: 0o755 },
    );
  }
  fs.writeFileSync(
    path.join(dir, ".zshrc"),
    [`[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"`, `PROMPT='%1~ %# '`, `RPROMPT=''`, `path=(${JSON.stringify(bin)} $path)`, ""].join("\n"),
  );
  process.env.ZDOTDIR = dir;
}

// Claude's turn has ended (end_turn) after `since`; `prompt` anchors it on
// that message and `configDir` reads a lesson's own Claude account.
const claudeDone = (root, since, { prompt, configDir } = {}) => claudeTurn(root, { since, prompt, configDir }).done;

// Codex writes one rollout per session under sessions/YYYY/MM/DD; a finished
// turn logs task_complete. The session's cwd is in its first line.
function codexDone(root, since) {
  const base = path.join(os.homedir(), ".codex", "sessions");
  const days = new Set();
  for (const t of [Date.now(), Date.now() - 86400000]) {
    const d = new Date(t);
    days.add(path.join(base, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")));
    days.add(path.join(base, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")));
  }
  for (const dir of days) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(dir, name);
      if (fs.statSync(file).mtimeMs < since - 1000) continue;
      const text = fs.readFileSync(file, "utf8");
      const first = text.slice(0, text.indexOf("\n"));
      if (!first.includes(JSON.stringify(root).slice(1, -1))) continue;
      const tail = text.slice(text.lastIndexOf('"type":"user_message"') + 1);
      if (tail.includes('"type":"task_complete"')) return true;
    }
  }
  return false;
}

async function until(s, done, { timeout = 120000, label = "wait" } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await done()) {
      s.log(`${label}: done`);
      return true;
    }
    await s.hold(300);
  }
  s.log(`${label}: timed out`);
  return false;
}

const focusWindow = (s) => s.control.call("window", { focus: true }).catch(() => {});

const isVisible = (s, sel) => s.control.evaluate((q) => !!window.__lc.find(q), sel);

const count = (s, css) =>
  s.control.evaluate((q) => [...document.querySelectorAll(q)].filter((b) => b.getBoundingClientRect().width > 0).length, css);

async function clickUntil(s, sel, done, opts = {}) {
  await s.click(sel, opts);
  for (let i = 0; i < 2 && !(await done()); i++) {
    await s.hold(400);
    if (await done()) return;
    await s.click(sel, { at: opts.at, ms: 300 });
  }
  const end = Date.now() + 1500;
  while (Date.now() < end && !(await done())) await s.hold(150);
}

// Clicks a header agent button until a new tab opens; resolves with the time
// it opened.
async function openAgent(s, name, { ms = 300, cue } = {}) {
  const sel = HEADER(name);
  const before = await count(s, TABS);
  await focusWindow(s);
  await s.click(sel, { ms, cue });
  for (let i = 0; i < 3; i++) {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      if ((await count(s, TABS)) > before) return Date.now();
      await s.hold(150);
    }
    if (i === 2) break;
    s.log(`${sel}: click lost, pressing again`);
    await focusWindow(s);
    await s.click(sel, { ms: 250 });
  }
  throw new Error(`${sel} never opened a tab`);
}

// Tags the visible matches of plain CSS `css`, top to bottom, as
// data-lesson="<name>-0", "<name>-1"…; returns how many it tagged.
const tagByPosition = (s, css, name) =>
  s.control.evaluate(
    (q, n) => {
      const els = [...document.querySelectorAll(q)]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      els.forEach((e, i) => (e.dataset.lesson = `${n}-${i}`));
      return els.length;
    },
    css,
    name,
  );

// A push-in on `sel` that never shows canvas left of the window: a target near
// the window's left edge (a sidebar row, the first tab) lands left of centre
// instead. The right side keeps the plain centring, clear of the button column.
// A landscape stage has no camera; there it is a plain zoom.
async function focusLeft(s, sel, { scale = 1.8, at = [0.5, 0.5], ms, cue } = {}) {
  if (typeof s.camera !== "function") return s.zoom(sel, { scale, at, ms, cue });
  const p = await s.point(sel, at);
  const half = (1.1 * s.origin.w) / scale / 2 - 0.05 * s.origin.w;
  await s.camera(scale, { x: Math.max(p.x, half), y: p.y }, { ms, cue });
}

// The real pointer somewhere with no hover effect.
function park(s, x = 0.7, y = 0.4) {
  if (s.mouse === "real") s.realMove(s.origin.w * x, s.origin.h * y);
}

// Types into the focused web field from inside the page, a character at a
// time. Real keystrokes into a WebKit field go through macOS's "Capitalize
// words automatically" (a service name "api" became "Api").
async function typeInto(s, text) {
  for (const ch of text) {
    await s.control.evaluate((c) => window.__lc.typeText(c), ch);
    await s.hold(55 + Math.random() * 45);
  }
}

async function waitGone(s, sel, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (!(await isVisible(s, sel))) return;
    await s.hold(100);
  }
  throw new Error(`${sel} is still on screen after ${timeout / 1000} s`);
}

// Scrolls `css` (plain CSS) to the middle of its own scrolling container,
// smoothly and on camera; scrollIntoView would move the whole page as well.
async function scrollTo(s, css, settle = 450) {
  const moved = await s.control.evaluate((q) => {
    const el = document.querySelector(q);
    let box = el?.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box) return false;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    box.scrollBy({ top: r.top + r.height / 2 - (b.top + b.height / 2), behavior: "smooth" });
    return true;
  }, css);
  if (moved) await s.hold(settle);
  return moved;
}

module.exports = {
  PROJECT,
  HEADER,
  TABS,
  COMPOSER_INPUT,
  SEND,
  writeProject,
  neutralShell,
  quietCodexMcp,
  restoreCodexMcp,
  claudeDone,
  codexDone,
  until,
  focusWindow,
  isVisible,
  count,
  clickUntil,
  openAgent,
  tagByPosition,
  focusLeft,
  park,
  typeInto,
  waitGone,
  scrollTo,
};
