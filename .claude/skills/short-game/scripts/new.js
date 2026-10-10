#!/usr/bin/env node
// node new.js "<model A>" "<model B>" [--game runner] [--pair "Claude vs GPT 6"] [--title "…"] [--slug s] [--force] [--dry <scratch dir>] [--list]
// Writes a short-race lesson whose prompt is a self-playing game from games.js,
// then rewrites its copy around the game: hook, headline, title and caption.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { GAMES, prompt } = require("./games");

const RACE = path.resolve(__dirname, "..", "..", "short-race", "scripts");
const { resolve } = require(path.join(RACE, "models"));
const TIMEOUT_MIN = 40;
const DRY_PROMPT =
  "Write index.html at the project root: a page with one red square centered on a white background. One file. Don't open it. Don't run or test it. No questions, just write it.";

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--game", "--pair", "--title", "--slug", "--dry"];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--list")) {
  for (const [key, g] of Object.entries(GAMES)) console.log(`${key.padEnd(9)} ${g.noun}: "${g.subject}"`);
  process.exit(0);
}

const specs = args.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
const gameKey = opt("--game") || "runner";
const game = GAMES[gameKey];
if (specs.length !== 2 || !game) {
  if (!game) console.error(`no game "${gameKey}"; pick one of ${Object.keys(GAMES).join(", ")} (or add it to games.js)`);
  console.error('usage: node new.js "opus 5.5 high" "gpt 6 astra high" [--game runner] [--pair "Claude vs GPT 6"] [--title "…"] [--slug s] [--force] [--dry <dir>]');
  process.exit(1);
}

const pairSides = opt("--pair") ? opt("--pair").split(/\s+vs\s+/i) : null;
if (pairSides && pairSides.length !== 2) {
  console.error(`--pair "${opt("--pair")}": write it as "<A> vs <B>"`);
  process.exit(1);
}

// A game prompt is long work: Opus 5.5 at xhigh thought past its output cap and
// never wrote the page in 40 minutes, at high it took 12. A Claude side with no
// effort would run at the user's saved default, so it gets high.
const sides = specs.map((spec) => {
  try {
    const m = resolve(spec);
    if (m.cli !== "claude" || m.effort) return { spec, dir: m.dir };
    console.log(`${spec}: no effort given, racing it at high`);
    return { spec: `${spec} high`, dir: resolve(`${spec} high`).dir };
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
});
const pinned = sides.map((s) => s.spec);

function race({ root, slug, racePrompt, subject }) {
  const env = { ...process.env, ...(root ? { LPM_TIKTOK_DIR: root } : {}) };
  let out;
  try {
    out = execFileSync(
      process.execPath,
      [path.join(RACE, "new.js"), ...pinned, "--prompt", racePrompt, "--subject", subject, "--slug", slug, ...(args.includes("--force") || root ? ["--force"] : [])],
      { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
  } catch {
    process.exit(1);
  }
  const dir = path.join(root || env.LPM_TIKTOK_DIR || path.join(env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons"), "tiktok"), slug);
  return { out, dir };
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");

const dryRoot = opt("--dry");
if (dryRoot) {
  const { dir } = race({ root: path.resolve(dryRoot), slug: "dry", racePrompt: DRY_PROMPT, subject: "a red square" });
  const c = readJson(path.join(dir, "compare.json"));
  writeJson(path.join(dir, "compare.json"), { ...c, timeoutMin: 10 });
  console.log(`dry run (about 2 min, real pointer and keys):\n  LPM_TIKTOK_DIR=${path.resolve(dryRoot)} ${dir}/take.sh --no-audio --frames`);
  process.exit(0);
}

const timeoutMin = game.timeoutMin || TIMEOUT_MIN;
const slug = opt("--slug") || `${sides.map((s) => s.dir).join("-vs-")}-${game.slug}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const { out, dir } = race({ slug, racePrompt: prompt(game), subject: game.subject });

const lessonFile = path.join(dir, "lesson.json");
const compareFile = path.join(dir, "compare.json");
const lesson = readJson(lessonFile);
const compare = readJson(compareFile);
const { a, b } = compare;

// short-race names the pair the way it is searched ("Claude or Gemini?"); the
// headline, caption and title reuse that name unless --pair sets another.
const hook = lesson.narration.find((l) => l.id === "hook");
const searched = hook.text.replace(/\*/g, "").replace(/\?$/, "").replace(" or ", " vs ");
const pair = opt("--pair") || searched;
if (pairSides) hook.text = `${pairSides[0]} or *${pairSides[1]}*?`;
hook.headline = `${pair}: ${game.headline}`;
const branded = a.brand !== b.brand;
lesson.title = opt("--title") || (branded ? `${pair}: ${a.headline} vs ${b.headline} build ${game.noun}` : `${a.headline} vs ${b.headline} build ${game.noun}`);
lesson.post.caption =
  `${pair} for coding: ${game.caption}. ${a.headline} and ${b.headline} got the same prompt, ${game.what}, ` +
  "and built it side by side in lpm's terminal. Which one wins? Comment the two models you want me to race next.";
writeJson(lessonFile, lesson);
writeJson(compareFile, { ...compare, game: gameKey, timeoutMin });

console.log(out.trimEnd());
console.log(`  game:     ${gameKey} (${game.noun}), ${timeoutMin} min per side
  hook:     ${hook.text}
  headline: ${hook.headline}
  title:    ${lesson.title}`);
