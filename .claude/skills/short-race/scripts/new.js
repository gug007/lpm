#!/usr/bin/env node
// node new.js "<model A>" "<model B>" [--effort e] [--prompt "…"] [--subject "…"] [--slug s] [--force]
// Writes a ready-to-record vertical lesson for short's make.js:
// lesson.json (narration, headline, post), compare.json (models and prompt),
// beats.js (this skill's shared beats) and take.sh.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolve } = require("./models");

const SKILL = path.resolve(__dirname, "..");
const MAKER = path.resolve(SKILL, "..", "short");
const ROOT = process.env.LPM_TIKTOK_DIR || path.join(process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons"), "tiktok");
const DEFAULT_PROMPT =
  "Build a giraffe flying a one-seat propeller plane, its neck sticking out the top, in index.html at the project root. One file, no libraries or images. It's shown in a wide, short panel and the window can be any size. Lay the scene out on a 900x360 stage: the plane spans about 25% of the stage's width, centered, with its body about 70% of the way down, and the giraffe's head reaches about 15% from the top. Scale the whole stage to fit the panel, centered, never cropped; the sky fills the rest. No scrolling. Animate forever. Don't open it. Don't run or test it. No questions, just write it.";
// The wide shot scales the window to 982 px wide, centred in 1080x1920, so the
// narrower it is the taller it shows: at 800 it runs from just under the
// headline to TikTok's caption area (y 1500), with only its footer below, and
// each row's page is 800x320, the 900x360 stage's own 2.5:1.
const WINDOW = { w: 800, h: 990 };
const CLI_NAME = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--effort", "--prompt", "--subject", "--slug"];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const specs = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
if (specs.length !== 2) {
  console.error('usage: node new.js "opus 5.5 max" "gpt 6 astra ultra" [--effort e] [--prompt "…"] [--subject "…"] [--slug s] [--force]');
  process.exit(1);
}

let a, b;
try {
  // --effort is the race's own, for a side that names none; a side that can't
  // run at it stops here rather than run at another level.
  [a, b] = specs.map((spec) => resolve(spec, opt("--effort")));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (a.dir === b.dir) {
  console.error(`both sides are ${a.label}: pick two different models or efforts`);
  process.exit(1);
}
// Model B runs in the copy that Run in duplicates makes. On the same CLI the
// dialog's per-run picker pins it, and that picker offers each Claude family
// only by its bare name (its newest model). On the other CLI the copy's own run
// override starts the project's second button, which launches model B pinned.
const crossCli = a.cli !== b.cli;
// Run #1 takes the prompt through its composer, which types into Claude Code
// and Codex; Cursor gets it as a launch argument, so it runs in the copy.
if (a.cli === "cursor") {
  console.error(
    b.cli === "cursor"
      ? `${a.name} and ${b.name} both run in Cursor CLI, and run #1 needs a Claude or GPT model: race one of them against one`
      : `put ${a.name} on the right: a Cursor model runs in the copy`,
  );
  process.exit(1);
}
if (!crossCli && !b.pickerModel) {
  console.error(`the copy's model picker can't pick ${b.name} (it offers each family's newest); swap the sides or pick the newest`);
  process.exit(1);
}

// Model A is picked on camera in run #1's composer when its Model menu offers
// it: Claude only (the Codex picker isn't scripted), and a family's newest
// only, as for model B. Otherwise the header button launches it pinned.
const pickA = a.cli === "claude" && Boolean(a.pickerModel);
if (pickA) a.cmd = "claude --permission-mode acceptEdits";

const prompt = opt("--prompt") || DEFAULT_PROMPT;
const giraffe = prompt === DEFAULT_PROMPT;
const subject = giraffe ? "a giraffe flying a plane" : opt("--subject")?.trim().replace(/[.!]+$/, "");
// The video says what both models were asked to build, so a custom prompt
// needs its short name.
if (!subject) {
  console.error('a custom --prompt needs --subject "<what it builds>", such as "a lava lamp": the video says it aloud');
  process.exit(1);
}
// lpm types the copy's launch line, prompt included, into a shell that is still
// starting, and macOS cuts a terminal line off at 1024 bytes: the agent never
// starts and the race waits out its limit. Cursor reads its prompt from a file.
const LINE_MAX = 1000;
if (b.cli !== "cursor") {
  const line = `${b.cmd} --session-id ${"0".repeat(36)} '${prompt.replace(/'/g, "'\\''")}'`;
  const bytes = Buffer.byteLength(line);
  if (bytes > LINE_MAX) {
    console.error(`the copy's launch line would be ${bytes} bytes, over the ${LINE_MAX} a starting shell takes: shorten the prompt by ${bytes - LINE_MAX}`);
    process.exit(1);
  }
}
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const topic = giraffe ? "giraffe" : slugify(subject).split("-").slice(0, 3).join("-");
const slug = opt("--slug") || slugify([`${a.dir}-vs-${b.dir}`, topic].filter(Boolean).join("-"));
const dir = path.join(ROOT, slug);
if (fs.existsSync(dir) && !args.includes("--force")) {
  console.error(`${dir} already exists (--force to overwrite its generated files)`);
  process.exit(1);
}

const sameModel = a.name === b.name;
const effortWord = (m) => m.spokenEffort || "default";
const upper = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const emoji = giraffe ? " 🦒" : "";
// A hook over 2.5 s loses the scroll: name the brands viewers search for when
// they differ ("Claude or ChatGPT?", "Claude or Grok?"), families when those
// differ ("Opus or Fable?"), full names only when they don't.
const family = (m) => m.name.split(" ")[0];
const branded = a.brand !== b.brand;
const hookNames = branded ? [a.brand, b.brand] : family(a) !== family(b) ? [family(a), family(b)] : [a.name, b.name];

const narration = [
  {
    id: "hook",
    text: sameModel ? `${upper(effortWord(a))} or *${effortWord(b)}* effort?` : `${hookNames[0]} or *${hookNames[1]}*?`,
    headline: branded ? `${a.brand} vs ${b.brand}: ${a.name} vs ${b.name}${emoji}` : `${a.headline} vs ${b.headline}${emoji}`,
  },
  // The first two lines play over the finished pages (lesson.open): viewers
  // left at 0:02 when a one-line opening cut to the setup. The setup happens
  // under them, unseen, so the video goes straight to both models at work.
  // The second names the prompt, so viewers know what the pages were asked to
  // be without reading it in the terminals.
  { id: "tease", text: `Same prompt: ${giraffe ? "a *giraffe* flying a *plane*" : subject.replace(/(\S+)$/, "*$1*")}.` },
  {
    id: "run",
    text: sameModel
      ? `${a.name} at *${effortWord(a)}* and *${effortWord(b)}* effort, both running in lpm's *terminal*.`
      : `*${a.name}* and *${b.name}*, both running in lpm's *terminal*.`,
  },
  { id: "wait", text: "Both are building it *now*." },
  { id: "reveal", text: "Here's what they *built*." },
  // Viewers name the next pair in the comments.
  { id: "wrap", text: `Which ${giraffe ? "giraffe" : "one"} *wins*? Comment two models to race *next*.` },
];

const clis = new Set([a.cli, b.cli]);
const hashtags = [
  ...new Set([a.brand, b.brand].map((w) => w.toLowerCase())),
  clis.has("claude") ? "claudecode" : clis.has("codex") ? "codex" : "cursor",
  "vibecoding",
  !branded && "aicoding",
  "lpm",
].filter(Boolean);
const what = giraffe ? "a giraffe flying a one-seat plane, built as an animated web page" : `${subject}, built as a web page`;
const lesson = {
  title: `${a.headline} vs ${b.headline}${giraffe ? ": the giraffe test" : ", same prompt"}`,
  window: WINDOW,
  open: 2,
  slam: sameModel ? { a: a.label, b: b.label } : { a: a.name, b: b.name },
  narration,
  post: {
    caption: `${branded ? `${a.brand} vs ${b.brand} for coding: ` : `${a.brand} `}${a.headline} vs ${b.headline} on the same prompt: ${what}, side by side in lpm's terminal. ${giraffe ? "Which giraffe wins?" : "Which one wins?"} Comment the two models you want me to race next.`,
    hashtags: hashtags.slice(0, 5),
  },
};
const compare = {
  a,
  b,
  prompt,
  project: "arena",
  pickA,
  cues: {
    a: sameModel ? effortWord(a) : a.name,
    b: sameModel ? effortWord(b) : b.name,
    lpm: "terminal",
    reveal: "built",
  },
};

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "lesson.json"), JSON.stringify(lesson, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "compare.json"), JSON.stringify(compare, null, 2) + "\n");
fs.writeFileSync(
  path.join(dir, "beats.js"),
  `// Generated by short-race: change compare.json or lesson.json, not this file.\n` +
    `module.exports = require(${JSON.stringify(path.join(SKILL, "scripts", "beats.js"))})({\n` +
    `  config: require("./compare.json"),\n  dir: __dirname,\n});\n`,
);
// A take changes the user's default model for new sessions: picking model A in
// the composer runs Claude Code's /model and /effort, and Cursor CLI saves the
// model it was launched with. take.sh puts each default back afterwards.
const saved = [pickA && "claude", clis.has("cursor") && "cursor"].filter(Boolean);
const RUN_TAKE = path.join(MAKER, "scripts", "take.sh");
const backup = (c) => `"$DIR/_${c}-settings.backup.json" ${c}`;
fs.writeFileSync(
  path.join(dir, "take.sh"),
  saved.length
    ? `#!/bin/sh
# The take changes the default model of ${saved.map((c) => CLI_NAME[c]).join(" and ")}, and puts it back afterwards.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULTS="${path.join(SKILL, "scripts", "cli-default.js")}"

${saved.map((c) => `node "$DEFAULTS" save ${backup(c)} || exit 1\n`).join("")}trap '${saved.map((c) => `node "$DEFAULTS" restore ${backup(c)}`).join("; ")}' EXIT
trap 'exit 130' INT TERM
"${RUN_TAKE}" "$DIR" "$@"
`
    : `#!/bin/sh
exec "${RUN_TAKE}" "$(dirname "$0")" "$@"
`,
  { mode: 0o755 },
);

console.log(`${slug}
  left:   ${a.label}  →  ${a.cmd}${pickA ? `, then ${[a.pickerModel, a.pickerEffort].filter(Boolean).join(" · ")} in its composer` : ""}
  right:  ${b.label}  →  ${crossCli ? `the copy's run override: ` : ""}${b.cmd}${b.cli === "cursor" ? " <prompt>" : ""}
  prompt: ${prompt}
  ${dir}/take.sh --no-audio --frames   (dry run)
  ${dir}/take.sh --frames              (the video)`);
