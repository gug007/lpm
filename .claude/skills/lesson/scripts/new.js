#!/usr/bin/env node
// node new.js "<title>" [--slug 15-short-name] [--card "Short title"]
//             [--projects storefront,client-portal] [--force]
// Starts a lesson in ~/Movies/lpm-lessons/<slug>/ (LPM_LESSONS_DIR): a
// lesson.json with the title line, placeholder lines to replace and the
// silent outro; a beats.js that seeds the projects through the shared kit,
// opens on the title card and closes on the lpm.cx card; and the take.sh
// stub. The placeholders fail the lint until they are written.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs } = require("util");

const { values: o, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { slug: { type: "string" }, card: { type: "string" }, projects: { type: "string" }, force: { type: "boolean" } },
  allowPositionals: true,
});
const title = positionals[0];
if (!title) {
  console.error('usage: node new.js "<title>" [--slug 15-short-name] [--card "Short title"] [--projects storefront,client-portal] [--force]');
  process.exit(2);
}
const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const next = fs.existsSync(ROOT) ? fs.readdirSync(ROOT).reduce((m, n) => Math.max(m, parseInt(n, 10) || 0), 0) + 1 : 1;
const words = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter(Boolean).slice(0, 6);
const slug = o.slug || `${String(next).padStart(2, "0")}-${words.join("-")}`;
const dir = path.join(ROOT, slug);
if (fs.existsSync(dir) && !o.force) {
  console.error(`${dir} exists; pass --force to rewrite its lesson.json, beats.js and take.sh`);
  process.exit(1);
}
const card = o.card || title;
const projects = (o.projects || "storefront").split(",").map((p) => p.trim()).filter(Boolean);
const PORTS = { storefront: 5173, "client-portal": 3000, "docs-site": 4321, "auth-service": 4000 };
const SKILL = path.resolve(__dirname, "..");

const lesson = {
  title,
  source: "app",
  narration: [
    { id: "title", text: `${title}. TODO: one sentence on what this lesson shows.` },
    { id: "first", text: "TODO: the first step, naming the control before the click lands on it.", chapter: "TODO chapter name" },
    { id: "wrap", text: "TODO: what the viewer can do now; no teaser for another video." },
    { id: "outro", ms: 3200 },
  ],
  youtube: {
    hook: ["TODO: what the video shows.", "TODO: who it is for."],
    learn: ["TODO"],
    tags: ["lpm", "lpm.cx", "Claude Code", "Codex", "mac dev tools", "tutorial"],
    hashtags: ["lpm", "macOS", "devtools", "ClaudeCode", "Codex"],
  },
};

const seed = projects
  .map((name) => `    kit.writeProject(lpmDir, workspace, { name: ${JSON.stringify(name)}, port: ${PORTS[name] || 3000} });`)
  .join("\n");
const beats = `// ${title}. Recorded from the desktop app; see the skill's
// reference/beats-api.md for every call a beat can make.
const kit = require(${JSON.stringify(path.join(SKILL, "scripts", "kit"))});

module.exports = {
  async setup({ lpmDir, workspace, settings }) {
    kit.neutralShell(lpmDir, workspace);
${seed}
    settings({ defaultProjectDirectory: \`\${workspace}/Projects\`, projectOrder: ${JSON.stringify(projects)} });
  },

  async title(s) {
    await s.card(${JSON.stringify(card)});
  },

  async first(s) {
    await s.click(kit.PROJECT(${JSON.stringify(projects[0])}), { ms: 700 });
  },

  async wrap(s) {
    await s.hold(0);
  },

  async outro(s) {
    await s.card("lpm.cx", { hold: true });
  },
};
`;

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "lesson.json"), JSON.stringify(lesson, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "beats.js"), beats);
fs.writeFileSync(path.join(dir, "take.sh"), `#!/bin/sh\nexec ${JSON.stringify(path.join(SKILL, "scripts", "take.sh"))} "$(dirname "$0")" "$@"\n`, { mode: 0o755 });
console.log(`${dir}\n  lesson.json  narration with TODO lines, the youtube block\n  beats.js     setup (${projects.join(", ")}), title card, lpm.cx card\n  take.sh      runs the take: ./take.sh --no-audio for a dry run, then ./take.sh`);
