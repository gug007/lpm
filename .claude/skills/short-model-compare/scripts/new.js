#!/usr/bin/env node
// node new.js "<model A>" "<model B>" [--prompt "…"] [--subject "…"] [--slug s] [--force]
// Writes a ready-to-record vertical lesson for tiktok-video-lesson's make.js:
// lesson.json (narration, headline, post), compare.json (models and prompt),
// beats.js (this skill's shared beats) and take.sh.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolve } = require("./models");

const SKILL = path.resolve(__dirname, "..");
const MAKER = path.resolve(SKILL, "..", "tiktok-video-lesson");
const ROOT = process.env.LPM_TIKTOK_DIR || path.join(process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons"), "tiktok");
const DEFAULT_PROMPT =
  "Build a giraffe flying a one-seat propeller plane, its neck sticking out the top, in index.html at the project root. One file, no libraries or images. It's shown in a tall, narrow panel (about 420x740) and the window can be any size: scale the scene so the whole giraffe and plane always fit inside it, centered, never cropped; the sky can fill the rest. No scrolling. Animate forever. Don't open it. No questions, just write it.";
const WINDOW = { w: 900, h: 1000 };

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--prompt", "--subject", "--slug"];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const specs = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
if (specs.length !== 2) {
  console.error('usage: node new.js "opus 5.5 max" "gpt 6 astra ultra" [--prompt "…"] [--subject "…"] [--slug s] [--force]');
  process.exit(1);
}

let a, b;
try {
  [a, b] = specs.map(resolve);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (a.dir === b.dir) {
  console.error(`both sides are ${a.label}: pick two different models or efforts`);
  process.exit(1);
}
// Model B runs in the copy that Run in duplicates makes, pinned by the dialog's
// per-run picker. That picker offers the CLI run #1 launches, and each Claude
// family only by its bare name (its newest model).
if (a.cli !== b.cli) {
  console.error(`${a.label} and ${b.label} use different CLIs; the copy's model picker only covers ${a.cli}`);
  process.exit(1);
}
if (!b.pickerModel) {
  console.error(`the copy's model picker can't pick ${b.name} (it offers each family's newest); swap the sides or pick the newest`);
  process.exit(1);
}

const prompt = opt("--prompt") || DEFAULT_PROMPT;
const giraffe = prompt === DEFAULT_PROMPT;
const subject = giraffe ? "a giraffe flying a plane" : opt("--subject");
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const topic = giraffe ? "giraffe" : subject ? slugify(subject).split("-").slice(0, 3).join("-") : "";
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
// A hook over 2.5 s loses the scroll: name families when they differ ("Opus or
// Fable?"), full names only when they don't.
const family = (m) => m.name.split(" ")[0];
const hookNames = family(a) !== family(b) ? [family(a), family(b)] : [a.name, b.name];
const bEffort = b.effort && b.effort !== a.effort ? ` at ${b.spokenEffort}` : "";

const narration = [
  {
    id: "hook",
    text: sameModel ? `${upper(effortWord(a))} or *${effortWord(b)}* effort?` : `${hookNames[0]} or *${hookNames[1]}*?`,
    headline: `${a.headline} vs ${b.headline}${emoji}`,
  },
  { id: "left", text: `*${a.name}*${a.effort ? ` at ${a.spokenEffort} effort` : ""} on the left.`, label: a.label },
  {
    id: "prompt",
    text: giraffe
      ? "One prompt. A *giraffe* flying a plane."
      : subject
        ? `One prompt. *${upper(subject)}*.`
        : "One *prompt* for both.",
    label: "One prompt",
  },
  { id: "dupes", text: "Run it in *duplicates*.", label: "Run in duplicates" },
  { id: "pick", text: `The copy gets *${b.name}*${bEffort}.`, label: b.label },
  { id: "go", text: "Side by side. *Go*." },
  { id: "wait", text: "Both are building it *now*." },
  { id: "reveal", text: "Here's what they *built*." },
  // Viewers name the next pair in the comments.
  { id: "wrap", text: `Which ${giraffe ? "giraffe" : "one"} *wins*? Comment two models to *race*.` },
];

const clis = new Set([a.cli, b.cli]);
const hashtags = [
  clis.has("claude") && "claudecode",
  clis.has("codex") && "codex",
  clis.size === 1 && (clis.has("claude") ? "claude" : "openai"),
  "aicoding",
  "aimodels",
  "lpm",
].filter(Boolean);
const what = giraffe ? "a giraffe flying a one-seat plane, built as an animated web page" : subject ? `${subject}, built as a web page` : "one prompt";
const lesson = {
  title: `${a.headline} vs ${b.headline}${giraffe ? ": the giraffe test" : ", same prompt"}`,
  window: WINDOW,
  narration,
  post: {
    caption: `${a.headline} vs ${b.headline} on the same prompt: ${what}, side by side in lpm. ${giraffe ? "Which giraffe wins?" : "Which one wins?"} Comment two models you want to see race.`,
    hashtags: hashtags.slice(0, 5),
  },
};
const compare = {
  a,
  b,
  prompt,
  project: "arena",
  cues: { left: a.name, prompt: "One", dupes: "duplicates", pick: b.name, go: "Go", reveal: "built" },
};

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "lesson.json"), JSON.stringify(lesson, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "compare.json"), JSON.stringify(compare, null, 2) + "\n");
fs.writeFileSync(
  path.join(dir, "beats.js"),
  `// Generated by short-model-compare: change compare.json or lesson.json, not this file.\n` +
    `module.exports = require(${JSON.stringify(path.join(SKILL, "scripts", "beats.js"))})({\n` +
    `  kit: require("../_kit"),\n  config: require("./compare.json"),\n  dir: __dirname,\n});\n`,
);
fs.writeFileSync(
  path.join(dir, "take.sh"),
  `#!/bin/sh
# A clipboard handed over from another device makes macOS show a "Pasting from
# <owner>'s iPhone" panel over the window whenever something reads it, so the
# take runs on an empty local clipboard and the text comes back afterwards.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
CLIP="$DIR/_clipboard.backup.txt"
SKILL=${MAKER}

[ -f "$CLIP" ] || pbpaste > "$CLIP"
printf '' | pbcopy
restore_clipboard() {
  [ -z "$(pbpaste)" ] && pbcopy < "$CLIP"
  rm -f "$CLIP"
}
trap restore_clipboard EXIT
trap 'exit 130' INT TERM

cd "$SKILL" && node scripts/make.js "$(basename "$DIR")" "$@"
`,
  { mode: 0o755 },
);

console.log(`${slug}
  left:   ${a.label}  →  ${a.cmd}
  right:  ${b.label}  →  ${b.cmd}
  prompt: ${prompt}
  ${dir}/take.sh --no-audio --frames   (dry run)
  ${dir}/take.sh --frames              (the video)`);
