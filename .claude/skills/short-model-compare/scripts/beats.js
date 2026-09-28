// Two models build the same animated page side by side, through lpm's own
// Run in duplicates: the project's header button launches run #1, whose
// composer's Model menu picks model A (or the button launches it pinned, when
// the menu can't pick it), the prompt goes into that composer, Run in
// duplicates makes a copy whose model the dialog's per-run picker sets to model
// B (or, when model B runs in the other CLI, the copy's run override starts the
// project's second button, pinned to model B, with the prompt typed again), and
// "Open side by side" shows run #1 and the copy as two columns. A race to
// index.html, then both pages in lpm's own browser. Each column's pane header
// carries a colour badge with the model and its time. `cue` = the spoken word
// an action lands on.
//
// The opening lines' beats are never seen (the video opens on the payoff), so
// the last of them does the setup: open the project, launch run #1. A lesson
// with a "tease" line opens on two lines and sets up there; an older one sets
// up in the hook.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AGENT_STARTUP_MS = 7000;
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;
const BADGE = [
  { bg: "#25F4EE", fg: "#0b0b10" },
  { bg: "#FE2C55", fg: "#ffffff" },
];

const COLLAPSE = 'button[title^="Collapse sidebar"]';
const OPEN_BROWSER = 'button:has-text("Open browser")';
const ACT = '[data-lesson="act-0"]';
const TERM = (i) => `[data-lesson="term-${i}"]`;
const COMPOSER = (i) => `[data-lesson="composer-${i}"]`;
const INPUT = (i) => `${COMPOSER(i)} >> [role="textbox"]`;
const SEND_MENU = `${COMPOSER(0)} >> button[aria-label="More send options"]`;
const MODEL_BUTTON = `${COMPOSER(0)} >> button[aria-haspopup="menu"][aria-label^="Model"]`;
const MODEL_MENU = '[data-lesson="model-menu"]';
const MENU_PICK = (i) => `[data-lesson="menu-pick-${i}"]`;
const RUN_IN_DUPLICATES = 'button:has-text("Run in duplicates")';
const MODEL_SELECT = 'button[title="Model and level this run starts with"]';
const PICK = (i) => `[data-lesson="pick-${i}"]`;
const COPY_RUN = 'button[title^="Run on this copy"]';
const COPY = (part) => `[data-lesson="copy-${part}"]`;
const HEAD = (i) => `[data-lesson="head-${i}"]`;
const ADDR = (i) => `[data-lesson="addr-${i}"]`;
const COLUMN = '[data-project-column]';
// The copy inherits the project's header button, so it names the CLI rather
// than model A; the banners and colour bars name the models.
const BUTTON = { claude: "Claude", codex: "Codex" };

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function git(root, ...args) {
  execFileSync("git", ["-c", "user.name=arena", "-c", "user.email=dev@example.com", ...args], { cwd: root, stdio: "ignore" });
}

const yamlString = (v) => JSON.stringify(v);

// Codex's rollouts for this exact folder (its first line names the cwd; an
// exact match keeps "…/arena" from also matching "…/arena-ab12cd"), newest
// first.
function codexRollouts(root, since) {
  const base = path.join(os.homedir(), ".codex", "sessions");
  const needle = `"cwd":${JSON.stringify(root)}`;
  const days = new Set();
  for (const t of [Date.now(), Date.now() - 86400000]) {
    const d = new Date(t);
    days.add(path.join(base, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")));
    days.add(path.join(base, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")));
  }
  const out = [];
  for (const dir of days) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(dir, name);
      if (fs.statSync(file).mtimeMs < since - 1000) continue;
      const text = fs.readFileSync(file, "utf8");
      if (text.slice(0, text.indexOf("\n")).includes(needle)) out.push(text);
    }
  }
  return out;
}

// A prompt in a Codex rollout: a user_message event up to 0.15x, a completed
// UserMessage item from 0.157.
const CODEX_PROMPT = ['"type":"user_message"', '"type":"UserMessage"'];
const lastPrompt = (text) => Math.max(...CODEX_PROMPT.map((n) => text.lastIndexOf(n)));

function codexDone(root, since) {
  return codexRollouts(root, since).some((text) => {
    const at = lastPrompt(text);
    return at >= 0 && text.slice(at).includes('"type":"task_complete"');
  });
}

const claudeDir = (root) => path.join(os.homedir(), ".claude", "projects", root.replace(/[^a-zA-Z0-9]/g, "-"));

// When the agent in `root` took the prompt, read from its own transcript, so
// each side is timed from its own start: the copy starts later than run #1
// (the clone, then its agent's boot).
function promptAt(cli, root, since) {
  const lines =
    cli === "claude"
      ? (fs.existsSync(claudeDir(root)) ? fs.readdirSync(claudeDir(root)) : [])
          .filter((n) => n.endsWith(".jsonl"))
          .map((n) => path.join(claudeDir(root), n))
          .filter((f) => fs.statSync(f).mtimeMs >= since - 1000)
          .flatMap((f) => fs.readFileSync(f, "utf8").split("\n"))
      : codexRollouts(root, since).flatMap((t) => t.split("\n"));
  const needles = cli === "claude" ? ['"type":"user"'] : CODEX_PROMPT;
  for (const line of lines) {
    if (!needles.some((n) => line.includes(n))) continue;
    const at = Date.parse(/"timestamp":"([^"]+)"/.exec(line)?.[1] ?? "");
    if (at >= since - 1000) return at;
  }
  return null;
}

// Tags the visible matches of `css` left to right (then top to bottom) as
// data-lesson="<name>-0", "<name>-1"….
const tagLeftToRight = (s, css, name) =>
  s.control.evaluate(
    (q, n) => {
      const els = [...document.querySelectorAll(q)]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .sort((a, b) => (Math.abs(a.r.left - b.r.left) > 30 ? a.r.left - b.r.left : a.r.top - b.r.top));
      els.forEach(({ e }, i) => (e.dataset.lesson = `${n}-${i}`));
      return els.length;
    },
    css,
    name,
  );

// The header button labelled `label`, tagged act-0.
const tagAction = (s, label) =>
  s.control.evaluate((text) => {
    const clean = (el) => el.textContent.replace(/[✻◆]/g, "").replace(/\s+/g, " ").trim();
    const btn = [...document.querySelectorAll('[data-actions-zone="header"] button')].find(
      (b) => b.getBoundingClientRect().width > 0 && clean(b) === text,
    );
    if (btn) btn.dataset.lesson = "act-0";
    return !!btn;
  }, label);

// The rows of the open model/level panel whose text is `labels[i]`, tagged
// pick-0, pick-1…
const tagPicks = (s, labels) =>
  s.control.evaluate((want) => {
    const panel = [...document.querySelectorAll("div.z-\\[70\\]")].filter((p) => p.getBoundingClientRect().width > 0).pop();
    if (!panel) return 0;
    let n = 0;
    want.forEach((text, i) => {
      const row = [...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
      if (row) {
        row.dataset.lesson = `pick-${i}`;
        n++;
      }
    });
    return n;
  }, labels);

// The copy's open run override, tagged by part: its Action segment as
// copy-action, the action picker as copy-picker, the open picker's row for
// `label` as copy-option and the prompt box as copy-input. Returns the parts
// found.
const tagCopyRun = (s, label) =>
  s.control.evaluate((want) => {
    const visible = (el) => el && el.getBoundingClientRect().width > 0;
    const text = (el) => el.textContent.replace(/[✻◆]/g, "").trim();
    const group = [...document.querySelectorAll('[role="group"]')].find(
      (g) => visible(g) && [...g.querySelectorAll("button")].some((b) => text(b) === "Default"),
    );
    if (!group) return [];
    const found = [];
    const tag = (el, part) => {
      if (!visible(el)) return;
      el.dataset.lesson = `copy-${part}`;
      found.push(part);
    };
    const root = group.parentElement;
    tag([...group.querySelectorAll("button")].find((b) => text(b) === "Action"), "action");
    tag(root.querySelector(":scope > div.relative > button"), "picker");
    tag(root.querySelector('[role="textbox"]'), "input");
    tag(
      [...document.querySelectorAll('[role="listbox"] [role="option"]')].find((o) => text(o) === want),
      "option",
    );
    return found;
  }, label);

// The composer's open Model menu as model-menu, its row for `model` as
// menu-pick-0 and the level flyout's row for `effort` as menu-pick-1.
const tagModelMenu = (s, model, effort) =>
  s.control.evaluate(
    (m, e) => {
      const row = (id) =>
        [...document.querySelectorAll(`[role="menuitemradio"][id$="-${id}"]`)].find((b) => b.getBoundingClientRect().width > 0);
      const modelRow = row(`model-${m}`);
      if (!modelRow) return false;
      modelRow.closest('[role="menu"]').dataset.lesson = "model-menu";
      modelRow.dataset.lesson = "menu-pick-0";
      const levelRow = e && row(`effort-${e}`);
      if (levelRow) levelRow.dataset.lesson = "menu-pick-1";
      return !e || Boolean(levelRow);
    },
    model,
    effort || "",
  );

// Pane headers left to right as head-0…, and each pane's browser address bar,
// once it has one, as addr-0….
const tagPanes = (s) =>
  s.control.evaluate(() => {
    const visible = (el) => el.getBoundingClientRect().width > 0;
    const headerOf = (btn) => {
      let el = btn;
      while (el && !(el.querySelectorAll('button[aria-label="Split down"]').length === 1 && el.querySelector("button.h-6.font-mono"))) {
        el = el.parentElement;
      }
      return el;
    };
    const heads = [...document.querySelectorAll('button[aria-label="Split down"]')]
      .filter(visible)
      .map(headerOf)
      .filter(Boolean)
      .map((h) => ({ h, r: h.getBoundingClientRect() }))
      .sort((a, b) => (Math.abs(a.r.top - b.r.top) > 30 ? a.r.top - b.r.top : a.r.left - b.r.left));
    const inputs = [...document.querySelectorAll('input[placeholder^="Search Google"]')].filter(visible);
    heads.forEach(({ h, r }, i) => {
      h.dataset.lesson = `head-${i}`;
      const mine = inputs
        .map((el) => ({ el, q: el.getBoundingClientRect() }))
        .filter(({ q }) => q.left >= r.left - 8 && q.right <= r.right + 8 && q.top > r.top)
        .sort((a, b) => a.q.top - b.q.top)[0];
      if (mine) mine.el.dataset.lesson = `addr-${i}`;
    });
    return heads.length;
  });

// A colour bar over each pane header naming its model, with a clock on the
// right. Fixed to the header's current box, so call it again after a layout
// change.
const badges = (s, items) =>
  s.control.evaluate((list) => {
    for (const [i, it] of list.entries()) {
      const h = document.querySelector(`[data-lesson="head-${i}"]`);
      let b = document.querySelector(`.lesson-model-badge[data-i="${i}"]`);
      if (!h) {
        b?.remove();
        continue;
      }
      if (!b) {
        b = document.createElement("div");
        b.className = "lesson-model-badge";
        b.dataset.i = String(i);
        b.innerHTML = "<span></span><span></span>";
        document.body.append(b);
      }
      const r = h.getBoundingClientRect();
      b.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${Math.max(r.height, 38)}px;z-index:2147483646;pointer-events:none;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;background:${it.bg};color:${it.fg};font:800 19px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:-.01em;box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap`;
      b.firstChild.textContent = it.name;
      b.lastChild.textContent = it.time || "";
      b.lastChild.style.fontVariantNumeric = "tabular-nums";
    }
  }, items);

module.exports = function compareBeats({ kit, config, dir }) {
  const sides = [config.a, config.b];
  const project = config.project || "arena";
  const timeoutMs = config.timeoutMin ? config.timeoutMin * 60 * 1000 : BUILD_TIMEOUT_MS;
  const sentAt = [0, 0];
  const finish = [null, null];
  let projectsDir;
  let roots = [];
  let clickedRun = 0;

  const badgeItems = () =>
    sides.map((m, i) => ({
      ...BADGE[i],
      name: `${m.emoji} ${m.label}`,
      time:
        finish[i] === "timeout"
          ? "✗ no page"
          : finish[i] != null
            ? `✓ ${clock(finish[i])}`
            : sentAt[i]
              ? clock(Date.now() - sentAt[i])
              : "",
    }));

  const done = (i) =>
    sides[i].cli === "claude" ? kit.claudeDone(roots[i], sentAt[i]) : codexDone(roots[i], sentAt[i]);
  const built = (i) => Boolean(roots[i]) && sentAt[i] > 0 && fs.existsSync(path.join(roots[i], "index.html")) && done(i);

  // The copy's folder: Run in duplicates clones the project next to it as
  // `<project>-<id>`.
  const copyRoot = () =>
    fs
      .readdirSync(projectsDir)
      .filter((n) => n.startsWith(`${project}-`))
      .map((n) => path.join(projectsDir, n))[0] ?? null;

  const noteStarts = () => {
    roots[1] = roots[1] || copyRoot();
    for (let i = 0; i < 2; i++) {
      if (!sentAt[i] && roots[i]) sentAt[i] = promptAt(sides[i].cli, roots[i], clickedRun) ?? 0;
    }
  };

  async function tagAll(s) {
    await tagLeftToRight(s, "[data-composer-box]", "composer");
    await tagLeftToRight(s, ".xterm", "term");
    return tagPanes(s);
  }

  async function race(s) {
    const end = Date.now() + timeoutMs;
    let shown = "";
    while (Date.now() < end && finish.some((f) => f == null)) {
      noteStarts();
      for (let i = 0; i < 2; i++) if (finish[i] == null && built(i)) finish[i] = Date.now() - sentAt[i];
      const items = badgeItems();
      const key = items.map((b) => b.time).join("|");
      if (key !== shown) {
        shown = key;
        await badges(s, items);
      }
      await s.hold(250);
    }
    for (let i = 0; i < 2; i++) if (finish[i] == null) finish[i] = "timeout";
    await badges(s, badgeItems());
    const result = sides.map((m, i) => ({ model: m.label, ms: finish[i] === "timeout" ? null : finish[i] }));
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result, null, 2) + "\n");
    s.log(`race: ${result.map((r) => `${r.model} ${r.ms == null ? "timeout" : (r.ms / 1000).toFixed(1) + "s"}`).join(", ")}`);
  }

  // Model A, picked in run #1's composer. The menu sends Claude /model and
  // /effort, and take.sh restores the default Claude saves them as.
  async function pickModelA(s) {
    const a = sides[0];
    await s.focus(MODEL_BUTTON, { scale: 1.8, at: [0.5, 0.5], ms: 400 });
    await kit.focusWindow(s);
    await kit.clickUntil(s, MODEL_BUTTON, () => tagModelMenu(s, a.pickerModel.toLowerCase(), a.effort), { ms: 300 });
    await s.focus(MODEL_MENU, { scale: 1.5, at: [0, 0.5], ms: 350 });
    if (a.effort) {
      await s.moveTo(MENU_PICK(0), { at: [0.4, 0.5], ms: 350, cue: config.cues.left });
      await s.click(MENU_PICK(1), { at: [0.5, 0.5], ms: 350, cue: config.cues.leftLevel });
    } else {
      await s.click(MENU_PICK(0), { at: [0.4, 0.5], ms: 350, cue: config.cues.left });
    }
    const want = `Model: ${[a.pickerModel, a.pickerEffort].filter(Boolean).join(" · ")}`;
    const shown = () => s.control.evaluate(() => {
      const b = document.querySelector('[data-lesson="composer-0"] button[aria-haspopup="menu"][aria-label^="Model"]');
      return b && !b.disabled ? b.getAttribute("aria-label") : "";
    });
    let now = "";
    await s.skip(
      async () => {
        const end = Date.now() + 30000;
        while ((now = await shown()) !== want && Date.now() < end) await s.hold(300);
      },
      { keepMs: 300 },
    );
    s.log(`run #1 model: ${now}`);
    if (now !== want) throw new Error(`run #1 reads "${now}", not "${want}"`);
  }

  // Model B in the other CLI: the copy's run override starts the project's
  // model B button. An override starts with an empty prompt, so the prompt is
  // typed again.
  async function overrideCopy(s) {
    const button = BUTTON[sides[1].cli];
    const has = async (part) => (await tagCopyRun(s, button)).includes(part);
    await s.focus(COPY_RUN, { scale: 1.7, at: [0.5, 0.5], ms: 400 });
    await kit.clickUntil(s, COPY_RUN, () => has("action"), { ms: 300 });
    await s.focus(COPY("action"), { scale: 1.5, at: [0.5, 0.5], ms: 350 });
    await kit.clickUntil(s, COPY("action"), () => has("picker"), { ms: 300 });
    await kit.clickUntil(s, COPY("picker"), () => has("option"), { ms: 300 });
    await s.click(COPY("option"), { at: [0.3, 0.5], ms: 300, cue: config.cues.pick });
    await s.skip(
      async () => {
        await tagCopyRun(s, button);
        await s.click(COPY("input"), { at: [0.2, 0.4], ms: 300 });
        await s.type(config.prompt);
      },
      { keepMs: 300 },
    );
    const shown = await s.control.evaluate(
      (picker, input) => [document.querySelector(picker)?.textContent.trim(), document.querySelector(input)?.textContent.length ?? 0],
      COPY("picker"),
      COPY("input"),
    );
    s.log(`copy runs: ${shown[0]}, prompt ${shown[1]} chars`);
    if (!shown[0]?.includes(button)) throw new Error(`the copy runs "${shown[0]}", not ${button}`);
  }

  async function openPage(s, i) {
    const file = roots[i] && path.join(roots[i], "index.html");
    await kit.focusWindow(s);
    // Work in the column first: the click that moves focus to it re-renders
    // it, and a menu click landing mid re-render is lost. Click its pane
    // header, not the terminal: a file path the agent printed there opens a
    // file preview over everything.
    await tagLeftToRight(s, COLUMN, "col");
    await tagPanes(s);
    const col = `[data-lesson="col-${i}"]`;
    const passive = await s.control.evaluate((q) => document.querySelector(q)?.dataset.projectColumn === "passive", col);
    if (passive) {
      await s.click(HEAD(i), { at: [0.55, 0.5], ms: 250 });
      await s.hold(500);
    }
    if (await kit.isVisible(s, '[role="dialog"]')) {
      await s.keys("escape");
      await s.hold(400);
    }
    const menu = `${HEAD(i)} >> button[aria-label="More options"]`;
    const end = Date.now() + 20000;
    while (!(await kit.isVisible(s, ADDR(i)))) {
      if (Date.now() > end) throw new Error(`no browser opened in column ${i}`);
      await tagPanes(s);
      if (await kit.isVisible(s, OPEN_BROWSER)) await s.click(OPEN_BROWSER, { at: [0.3, 0.5], ms: 250 });
      else await s.click(menu, { ms: 250 });
      await s.hold(900);
      await tagPanes(s);
    }
    await s.click(ADDR(i), { at: [0.5, 0.5], ms: 250 });
    await s.type(file && fs.existsSync(file) ? `file://${file}` : `file://${roots[i] || projectsDir}`);
    await s.keys("return");
    await s.hold(600);
  }

  const teased = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8")).narration.some((l) => l.id === "tease");

  async function setupRun(s) {
    await kit.focusWindow(s);
    await kit.clickUntil(s, kit.PROJECT(project), () => kit.isVisible(s, `[data-actions-zone="header"]`), { at: [0.3, 0.5], ms: 300 });
    await s.waitFor(`[data-actions-zone="header"]`, 8000);
    await s.hold(800);
    await kit.clickUntil(s, COLLAPSE, async () => !(await kit.isVisible(s, COLLAPSE)), { ms: 250 });
    await s.hold(400);
    const found = Date.now() + 8000;
    const button = BUTTON[sides[0].cli];
    while (!(await tagAction(s, button))) {
      if (Date.now() > found) throw new Error(`no header button "${button}"`);
      await s.hold(200);
    }
    const before = await kit.count(s, kit.TABS);
    for (let attempt = 0; attempt < 3 && (await kit.count(s, kit.TABS)) === before; attempt++) {
      await tagAction(s, button);
      await kit.focusWindow(s);
      await s.click(ACT, { ms: 300 });
      await s.hold(3000);
    }
    if ((await kit.count(s, kit.TABS)) === before) throw new Error(`${button} never opened a tab`);
    await s.hold(AGENT_STARTUP_MS);
    await tagAll(s);
    kit.park(s);
  }

  return {
    setup: async ({ lpmDir, workspace, settings }) => {
      kit.neutralShell(lpmDir, workspace);
      projectsDir = path.join(workspace, "Projects");
      const root = path.join(projectsDir, project);
      roots = [root, null];
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, "README.md"), `# ${project}\n`);
      git(root, "init", "-q", "-b", "main");
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", "Initial commit");
      const projects = path.join(lpmDir, "projects");
      fs.mkdirSync(projects, { recursive: true });
      // Model B gets its own button only in the other CLI, where the copy's run
      // override starts it.
      const buttons = sides
        .map((m, i) => ({ m, id: i ? "model-b" : "model-a", position: i + 1 }))
        .filter(({ m }, i) => i === 0 || m.cli !== sides[0].cli)
        .map(
          ({ m, id, position }) =>
            `  ${id}:\n    label: ${yamlString(BUTTON[m.cli])}\n    emoji: ${yamlString(m.emoji)}\n    cmd: ${yamlString(m.cmd)}\n    type: terminal\n    position: ${position}\n`,
        );
      fs.writeFileSync(
        path.join(projects, `${project}.yml`),
        `name: ${project}\nroot: ${root}\n\nservices:\n  preview:\n    cmd: python3 -m http.server 4173\n    port: 4173\n\nactions:\n${buttons.join("")}`,
      );
      // A global.yml already there keeps the default Claude and Codex buttons
      // out of the header, so it holds only the buttons above.
      fs.writeFileSync(path.join(lpmDir, "global.yml"), "actions: {}\n");
      // The copy has no remote to pull from.
      settings({
        defaultProjectDirectory: workspace,
        projectOrder: [project],
        runInDuplicatesSideBySide: true,
        duplicatePullLatest: false,
      });
    },

    hook: async (s) => {
      if (!teased) await setupRun(s);
    },
    tease: async (s) => setupRun(s),
    left: async (s) => {
      await tagAll(s);
      if (config.pickA) await pickModelA(s);
      else await kit.focusLeft(s, TERM(0), { scale: 1.6, at: [0.3, 0.1], ms: 450, cue: config.cues.left });
    },
    prompt: async (s) => {
      await kit.focusLeft(s, INPUT(0), { scale: 1.8, at: [0.4, 0.5], ms: 450, cue: config.cues.prompt });
      await kit.focusWindow(s);
      await s.click(INPUT(0), { at: [0.2, 0.4], ms: 350 });
      await s.skip(() => s.type(config.prompt), { keepMs: 200 });
    },
    dupes: async (s) => {
      await s.focus(SEND_MENU, { scale: 1.8, at: [0.5, 0.5], ms: 400 });
      await kit.clickUntil(s, SEND_MENU, () => kit.isVisible(s, RUN_IN_DUPLICATES), { ms: 300 });
      await s.click(RUN_IN_DUPLICATES, { at: [0.3, 0.5], ms: 300, cue: config.cues.dupes });
      await s.waitFor(MODEL_SELECT, 5000);
      await s.wide({ ms: 400 });
    },
    pick: async (s) => {
      const b = sides[1];
      if (b.cli !== sides[0].cli) return overrideCopy(s);
      await s.focus(MODEL_SELECT, { scale: 1.7, at: [0.5, 0.5], ms: 400 });
      await kit.clickUntil(s, MODEL_SELECT, async () => (await tagPicks(s, [b.pickerModel])) === 1, { ms: 300 });
      await s.click(PICK(0), { at: [0.3, 0.5], ms: 300, cue: config.cues.pick });
      if (b.pickerEffort) {
        await tagPicks(s, [b.pickerModel, b.pickerEffort]);
        await s.click(PICK(1), { at: [0.3, 0.5], ms: 300 });
      }
      await s.click(MODEL_SELECT, { at: [0.8, 0.5], ms: 250 });
      const shown = await s.control.evaluate((q) => document.querySelector(q)?.textContent.trim(), MODEL_SELECT);
      s.log(`copy model: ${shown}`);
    },
    go: async (s) => {
      await s.focus('button:has-text("Run 2 in parallel")', { scale: 1.8, at: [0.5, 0.5], ms: 400 });
      clickedRun = Date.now();
      await s.click('button:has-text("Run 2 in parallel")', { ms: 300, cue: config.cues.go });
      kit.park(s);
      // The button closes with the dialog; don't hold a shot of where it was.
      await s.wide({ ms: 400 });
      await s.skip(
        async () => {
          const end = Date.now() + 90000;
          while (Date.now() < end && (await kit.count(s, COLUMN)) < 2) await s.hold(300);
          if ((await kit.count(s, COLUMN)) < 2) throw new Error("the copy never opened beside run #1");
          while (Date.now() < end && (await kit.count(s, ".xterm")) < 2) await s.hold(300);
          await s.hold(AGENT_STARTUP_MS);
          noteStarts();
          s.log(`copy: ${roots[1]}`);
          if (roots[1] && fs.existsSync(path.join(roots[1], "index.html"))) s.log("warning: the copy cloned run #1's index.html");
          s.log(`panes: ${await tagAll(s)}`);
          await badges(s, badgeItems());
        },
        { keepMs: 300 },
      );
    },
    wait: async (s) => {
      await s.focus(TERM(1), { scale: 1.6, at: [0.3, 0.1], ms: 450 });
      await s.skip(
        async () => {
          await race(s);
          for (let i = 0; i < 2; i++) await openPage(s, i);
          await tagPanes(s);
          await badges(s, badgeItems());
          kit.park(s, 0.5, 0.02);
          await s.hold(1500);
        },
        { keepMs: 300 },
      );
    },
    // The payoff shot runs from the reveal to the end, long enough to open on
    // two lines.
    reveal: async (s) => {
      await s.hideCursor();
      await badges(s, badgeItems());
      await s.wide({ ms: 400 });
      await s.hold(450);
      await s.payoff();
    },
    wrap: async (s) => {
      await s.frame("payoff");
      await s.hold(5500);
    },
  };
};
