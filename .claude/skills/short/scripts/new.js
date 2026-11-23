#!/usr/bin/env node
// node new.js "<title>" [--slug <slug>] [--headline "<cover text>"]
//             [--projects storefront,client-portal] [--window 860x1040] [--force]
// Starts a vertical lesson in ~/Movies/lpm-lessons/tiktok/<slug>/
// (LPM_TIKTOK_DIR): lesson.json with the lines to write, beats.js that seeds the
// projects and ends on the payoff, and the take.sh stub. The placeholders fail
// the lint until they are written.
const path = require("path");
const { parseArgs } = require("util");
const { slugOf, projectsOf, kitLine, setupBeat, refuseExisting, writeLesson } = require("./shared")("scaffold");
const ROOT = require("./root");

const USAGE = 'usage: new.js "<title>" [--slug <slug>] [--headline "<cover text>"] [--projects storefront,client-portal] [--window 860x1040] [--force]';

let o, title;
try {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: { slug: { type: "string" }, headline: { type: "string" }, projects: { type: "string" }, window: { type: "string" }, force: { type: "boolean" } },
    allowPositionals: true,
  });
  o = parsed.values;
  title = parsed.positionals[0];
} catch (e) {
  console.error(`${e.message}\n${USAGE}`);
  process.exit(2);
}
const size = /^(\d+)x(\d+)$/.exec(o.window || "860x1040");
if (!title || !size) {
  console.error(USAGE);
  process.exit(2);
}
const dir = path.join(ROOT, o.slug || slugOf(title));
refuseExisting(dir, o.force);
const projects = projectsOf(o.projects);

const lesson = {
  title,
  window: { w: Number(size[1]), h: Number(size[2]) },
  open: 2,
  narration: [
    { id: "hook", text: "TODO: the problem, the surprise or the result, under 2.5 s.", headline: o.headline || "TODO: 4-8 words, the ones people search for" },
    { id: "tease", text: "TODO: a reason to keep watching." },
    { id: "first", text: "TODO: the first step, naming the control.", label: "TODO: the step" },
    { id: "wrap", text: "TODO: what the viewer can do now." },
  ],
  post: { caption: "TODO: one or two sentences people would search for.", hashtags: ["claude", "claudecode", "aicoding", "devtools", "lpm"] },
};

const beats = `// ${title}. Every call a beat can make: the skill's reference/beats.md.
${kitLine}

module.exports = {
${setupBeat(projects)}

  // The opening lines' beats are never seen; the last of them does the setup.
  async hook() {},

  async tease(s) {
    await s.click(kit.PROJECT(${JSON.stringify(projects[0])}), { at: [0.3, 0.5], ms: 300, verify: kit.HEADER("Claude") });
    kit.park(s);
  },

  async first(s) {
    await s.focus("TODO selector", { scale: 1.8, cue: "TODO word" });
    await s.click("TODO selector", { cue: "TODO word", verify: "TODO selector" });
  },

  // The shot the video opens on, held for at least the whole opening.
  async wrap(s) {
    await s.wide();
    await s.hideCursor();
    await s.payoff();
    await s.hold(4500);
  },
};
`;

writeLesson(dir, { lesson, beats, skill: path.resolve(__dirname, "..") });
console.log(`${dir}\n  lesson.json  the lines, the headline and the post to write\n  beats.js     setup (${projects.join(", ")}), one beat per line, the payoff\n  take.sh      --speak-only (the voice), --no-audio (the dry run), then the take`);
