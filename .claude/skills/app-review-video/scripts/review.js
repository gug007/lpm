#!/usr/bin/env node
// review.js <command>: the App Review video session.
//   setup [--name "MacBook Pro"] [--build]   seed + launch the review Mac beside iPhone Mirroring
//   arrange                                  put the review window back beside the phone
//   record                                   start recording (returns; the capture runs on)
//   mark "<caption>" ["<subtitle>"]          start the next numbered step caption
//   checkpoint / cut                         cut drops the video since the last checkpoint
//   stop                                     finish the recording
//   render [--version <v>] [--build <n>] [--device "iPhone 18 Pro"] [--cut a-b,...]
//          [--redact <regex>] [--no-camera] [--dir <dir>]
//   eval "<js>"                              run JavaScript in the review app's page
//   status                                   session paths, pids, windows
//   teardown                                 quit the review Mac and delete its data
const fs = require("fs");
const path = require("path");
const session = require("./session");
const record = require("./record");

function flags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) out._.push(a);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

function mobileVersion() {
  const yml = fs.readFileSync(path.join(session.REPO, "mobile/project.yml"), "utf8");
  return /MARKETING_VERSION:\s*"?([\d.]+)/.exec(yml)?.[1] || "dev";
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  switch (cmd) {
    case "setup":
      await session.launch({ name: f.name || "MacBook Pro", build: !!f.build });
      break;
    case "arrange":
      console.log(JSON.stringify(await session.arrange(), null, 2));
      break;
    case "record":
      await record.start();
      break;
    case "mark":
      if (!f._[0]) throw new Error('usage: review.js mark "<caption>" ["<subtitle>"]');
      record.mark(f._[0], f._[1]);
      break;
    case "checkpoint":
      record.checkpoint();
      break;
    case "cut":
      record.cut();
      break;
    case "stop":
      await record.stop();
      break;
    case "render": {
      const dir = f.dir || session.readState().out;
      if (!dir) throw new Error("no session directory: pass --dir");
      await require("./render").render({ dir, version: f.version || mobileVersion(), build: f.build, device: f.device, cut: f.cut,
        redact: f.redact ? [f.redact] : [], camera: !f["no-camera"] });
      break;
    }
    case "eval":
      console.log(JSON.stringify(await session.evaluate(f._[0]), null, 2));
      break;
    case "status": {
      const s = session.readState();
      console.log(JSON.stringify({ ...s, appAlive: !!s.pid && session.alive(s.pid), recording: !!s.recorder && session.alive(s.recorder), lpmDir: session.LPM_DIR }, null, 2));
      break;
    }
    case "teardown":
      await session.teardown();
      break;
    default:
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 13).join("\n").replace(/^\/\/ ?/gm, ""));
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(`review: ${e.message}`);
  process.exit(1);
});
