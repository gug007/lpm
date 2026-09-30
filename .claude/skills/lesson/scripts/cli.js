// The one flag table make.js (both skills) and preflight.js read, parsed
// strictly: a mistyped flag stops the run instead of being ignored.
const path = require("path");
const { parseArgs } = require("util");

const FLAGS = {
  "no-audio": "dry run: estimated line lengths, no voice, no mux",
  frames: "kept for older notes; beat-end frames are always written now",
  "mux-only": "re-cut the last take (or --take) without recording",
  speak: "with --mux-only: speak lines whose text changed and check they still fit the take",
  respeak: "speak every line again (needs a new take)",
  demo: "record the website demo instead of the app",
  app: "record the app (the default)",
  "keep-state": "keep the previous take's data directory",
  "dom-mouse": "dispatch pointer events in the page instead of the real pointer",
  "no-music": "leave the music bed out",
  "no-qa": "skip the checks after the mux",
};
const VALUES = {
  "lpm-dir": "the app's data directory for the take (absolute path)",
  take: "with --mux-only: re-cut an archived take from _takes/ (its number)",
  variant: "render a voice variant into variants/",
  voice: "TTS voice",
  style: "TTS style prompt",
  music: "music bed file",
};

const usage = (script) =>
  `usage: node ${script} <lesson folder or slug> [flags]\n` +
  Object.entries(FLAGS).map(([k, v]) => `  --${k.padEnd(12)} ${v}`).join("\n") +
  "\n" +
  Object.entries(VALUES).map(([k, v]) => `  --${(k + " <v>").padEnd(12)} ${v}`).join("\n");

// `positional: "optional"` lets preflight run without a lesson.
function parseCli(argv, { script, positional = "required" } = {}) {
  const options = {};
  for (const k of Object.keys(FLAGS)) options[k] = { type: "boolean" };
  for (const k of Object.keys(VALUES)) options[k] = { type: "string" };
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, strict: true, allowPositionals: true });
  } catch (e) {
    throw usageError(`${e.message}\n${usage(script)}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) throw usageError(`one lesson at a time (got ${positionals.join(", ")})\n${usage(script)}`);
  if (!positionals.length && positional === "required") throw usageError(usage(script));
  if (values.take && !values["mux-only"]) throw usageError("--take re-cuts an archived take; add --mux-only");
  if (values.speak && !values["mux-only"]) throw usageError("--speak is for --mux-only re-cuts; a take speaks every changed line anyway");
  if (values["lpm-dir"] && !path.isAbsolute(values["lpm-dir"])) throw usageError(`--lpm-dir must be an absolute path (got ${values["lpm-dir"]})`);
  return { o: values, lesson: positionals[0] || null };
}

function usageError(message) {
  const e = new Error(message);
  e.usage = true;
  return e;
}

// A path (anything with a slash) is used as it is; a bare slug is looked up
// under `root`, so a scratch copy passed by path never re-cuts the original.
function lessonDir(arg, root) {
  return arg.includes("/") ? path.resolve(arg) : path.join(root, arg);
}

module.exports = { parseCli, lessonDir, usage, FLAGS, VALUES };

// node cli.js lpm-dir <lesson> [flags]: the data directory the take will run
// on, resolved and checked the way make.js does (take.sh cleans up there).
if (require.main === module && process.argv[2] === "lpm-dir") {
  const { checkDataDir, DEFAULT_LPM_DIR } = require("./state");
  try {
    const { o } = parseCli(process.argv.slice(3), { script: "take.sh" });
    console.log(checkDataDir(o["lpm-dir"] || process.env.LPM_LESSON_DIR || DEFAULT_LPM_DIR));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
