// Two models build the same animated page side by side: one lpm project with
// a header button per model, each launching its CLI in its own folder, a
// split pane, the same prompt in both composers, a race to index.html, then
// both pages in lpm's own browser. Each pane header carries a colour badge
// with the model and its time. `cue` = the spoken word an action lands on.
//
// The hook line's beat is never seen (the video opens on the payoff), so it
// does the setup: open the project, launch both agents, split.
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
const SPLIT_RIGHT = 'button[aria-label="Split right"]';
const SPLIT_DOWN = 'button[aria-label="Split down"]';
const OPEN_BROWSER = 'button:has-text("Open browser")';
const ACT = (i) => `[data-lesson="act-${i}"]`;
const TERM = (i) => `[data-lesson="term-${i}"]`;
const COMPOSER = (i) => `[data-lesson="composer-${i}"]`;
const INPUT = (i) => `${COMPOSER(i)} >> [role="textbox"]`;
const SEND = (i) => `${COMPOSER(i)} >> button[aria-label="Send"]`;
const HEAD = (i) => `[data-lesson="head-${i}"]`;
const ADDR = (i) => `[data-lesson="addr-${i}"]`;

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function git(root, ...args) {
  execFileSync("git", ["-c", "user.name=arena", "-c", "user.email=dev@example.com", ...args], { cwd: root, stdio: "ignore" });
}

const yamlString = (v) => JSON.stringify(v);

// Codex's rollout names its session folder in the first line; an exact match
// keeps "…/opus-5" from also matching "…/opus-5.5".
function codexDone(root, since) {
  const base = path.join(os.homedir(), ".codex", "sessions");
  const needle = `"cwd":${JSON.stringify(root)}`;
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
      if (!text.slice(0, text.indexOf("\n")).includes(needle)) continue;
      const tail = text.slice(text.lastIndexOf('"type":"user_message"') + 1);
      if (tail.includes('"type":"task_complete"')) return true;
    }
  }
  return false;
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

// The header action labelled `label`, tagged act-<i>. An exact match wins, so
// "Opus 5" never lands on "Opus 5.5".
const tagAction = (s, label, i) =>
  s.control.evaluate(
    (text, n) => {
      const clean = (el) => el.textContent.replace(/[✻◆]/g, "").replace(/\s+/g, " ").trim();
      const shown = [...document.querySelectorAll('[data-actions-zone="header"] button')].filter((b) => b.getBoundingClientRect().width > 0);
      const btn =
        shown.find((b) => clean(b) === text) ||
        shown.filter((b) => clean(b).includes(text)).sort((a, b) => clean(a).length - clean(b).length)[0];
      if (btn) btn.dataset.lesson = `act-${n}`;
      return !!btn;
    },
    label,
    i,
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
  const sentAt = [0, 0];
  const finish = [null, null];
  let projectRoot;
  let roots = [];

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

  const built = (i) =>
    fs.existsSync(path.join(roots[i], "index.html")) &&
    (sides[i].cli === "claude" ? kit.claudeDone(roots[i], sentAt[i]) : codexDone(roots[i], sentAt[i]));

  async function launch(s, i) {
    const before = await kit.count(s, kit.TABS);
    const found = Date.now() + 8000;
    while (!(await tagAction(s, sides[i].label, i))) {
      if (Date.now() > found) throw new Error(`no header button "${sides[i].label}"`);
      await s.hold(200);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await tagAction(s, sides[i].label, i);
      await kit.focusWindow(s);
      await s.click(ACT(i), { ms: 300 });
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        if ((await kit.count(s, kit.TABS)) > before) return Date.now();
        await s.hold(150);
      }
      s.log(`${sides[i].label}: click lost, pressing again`);
    }
    throw new Error(`${sides[i].label} never opened a tab`);
  }

  async function tagAll(s) {
    await tagLeftToRight(s, "[data-composer-box]", "composer");
    await tagLeftToRight(s, ".xterm", "term");
    return tagPanes(s);
  }

  async function race(s) {
    const end = Date.now() + BUILD_TIMEOUT_MS;
    let shown = "";
    while (Date.now() < end && finish.some((f) => f == null)) {
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

  async function openPage(s, i) {
    const file = path.join(roots[i], "index.html");
    await tagPanes(s);
    await kit.focusWindow(s);
    await kit.clickUntil(s, `${HEAD(i)} >> button[aria-label="More options"]`, () => kit.isVisible(s, OPEN_BROWSER), { ms: 250 });
    await s.click(OPEN_BROWSER, { at: [0.3, 0.5], ms: 250 });
    await s.hold(600);
    await tagPanes(s);
    await s.waitFor(ADDR(i), 5000);
    await s.click(ADDR(i), { at: [0.5, 0.5], ms: 250 });
    await s.type(fs.existsSync(file) ? `file://${file}` : `file://${roots[i]}`);
    await s.keys("return");
    await s.hold(600);
  }

  return {
    setup: async ({ lpmDir, workspace, settings }) => {
      kit.neutralShell(lpmDir, workspace);
      projectRoot = path.join(workspace, "Projects", project);
      roots = sides.map((m) => path.join(projectRoot, m.dir));
      for (const root of roots) {
        fs.mkdirSync(root, { recursive: true });
        git(root, "init", "-q", "-b", "main");
        git(root, "commit", "-q", "--allow-empty", "-m", "Initial commit");
      }
      const actions = sides
        .map((m, i) =>
          [
            `  model-${i === 0 ? "a" : "b"}:`,
            `    label: ${yamlString(m.label)}`,
            `    emoji: ${yamlString(m.emoji)}`,
            `    cmd: ${yamlString(m.cmd)}`,
            `    cwd: ${yamlString(m.dir)}`,
            `    type: terminal`,
            `    position: ${i + 1}`,
          ].join("\n"),
        )
        .join("\n");
      const projects = path.join(lpmDir, "projects");
      fs.mkdirSync(projects, { recursive: true });
      fs.writeFileSync(
        path.join(projects, `${project}.yml`),
        `name: ${project}\nroot: ${projectRoot}\n\nservices:\n  preview:\n    cmd: python3 -m http.server 4173\n    port: 4173\n\nactions:\n${actions}\n`,
      );
      // A global.yml already there keeps the default Claude and Codex buttons
      // out of the header, so it holds only the two model buttons.
      fs.writeFileSync(path.join(lpmDir, "global.yml"), "actions: {}\n");
      settings({ defaultProjectDirectory: workspace, projectOrder: [project] });
    },

    hook: async (s) => {
      await s.click(kit.PROJECT(project), { at: [0.3, 0.5], ms: 300 });
      await s.waitFor(`[data-actions-zone="header"]`, 8000);
      await s.hold(800);
      await kit.clickUntil(s, COLLAPSE, async () => !(await kit.isVisible(s, COLLAPSE)), { ms: 250 });
      await s.hold(400);
      await launch(s, 0);
      await s.hold(1500);
      await kit.focusWindow(s);
      await kit.clickUntil(s, SPLIT_RIGHT, async () => (await kit.count(s, SPLIT_DOWN)) >= 2, { ms: 300 });
      await s.hold(500);
      const opened = await launch(s, 1);
      const rest = opened + AGENT_STARTUP_MS - Date.now();
      if (rest > 0) await s.hold(rest);
      s.log(`panes: ${await tagAll(s)}`);
      await badges(s, badgeItems());
      kit.park(s);
    },
    left: async (s) => {
      await tagAll(s);
      await badges(s, badgeItems());
      await kit.focusLeft(s, TERM(0), { scale: 1.6, at: [0.3, 0.1], ms: 450, cue: config.cues.left });
    },
    right: async (s) => {
      await s.focus(TERM(1), { scale: 1.6, at: [0.3, 0.1], ms: 450, cue: config.cues.right });
    },
    prompt: async (s) => {
      await tagAll(s);
      await kit.focusLeft(s, INPUT(0), { scale: 1.8, at: [0.4, 0.5], ms: 450, cue: config.cues.prompt });
      await kit.focusWindow(s);
      await s.click(INPUT(0), { at: [0.2, 0.4], ms: 350 });
      await s.skip(
        async () => {
          await s.type(config.prompt);
          await kit.focusWindow(s);
          await s.click(INPUT(1), { at: [0.2, 0.4], ms: 300 });
          await s.type(config.prompt);
        },
        { keepMs: 200 },
      );
    },
    go: async (s) => {
      await s.wide({ ms: 400 });
      await s.click(SEND(0), { ms: 350, cue: "Send", pause: 60, settle: 60 });
      sentAt[0] = Date.now();
      await s.click(SEND(1), { ms: 250, cue: "Go", pause: 60, settle: 60 });
      sentAt[1] = Date.now();
      kit.park(s);
      await badges(s, badgeItems());
    },
    wait: async (s) => {
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
    reveal: async (s) => {
      await s.hideCursor();
      await badges(s, badgeItems());
      await s.wide({ ms: 400, cue: config.cues.reveal });
    },
    wrap: async (s) => {
      await s.payoff();
      await s.frame("payoff");
      await s.hold(3400);
    },
  };
};
