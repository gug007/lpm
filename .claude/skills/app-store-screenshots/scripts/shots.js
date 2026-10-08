#!/usr/bin/env node
const path = require("path");
const { config, appVersion } = require("./paths");
const { build } = require("./build");
const sim = require("./sim");
const { compose, sheet } = require("./compose");

const USAGE = `shots.js <command> [--device iphone|ipad] [--only name,name] [--version <v>]
  build      scratch copy of mobile/ + screenshot patches, Release simulator build
  prepare    boot the simulators (US English, 9:41, full battery) and install the build
  capture    launch each shot's route and save the simulator screenshot
  compose    lay the captures into App Store images + a contact sheet per device
  all        build, prepare, capture, compose
  cleanup    clear status bars, shut down simulators this skill booted

shots.json holds the devices, the order, captions and routes. Route steps, joined by " > ":
  list | project:<name> | terminal:<project>/<terminalId> | changes:<project>
  usage | stats | activity | automations | automation:<project>/<jobId>`;

function args(argv) {
  const o = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    o[k] = argv[i + 1];
    i++;
  }
  return o;
}

function plan(c, opts) {
  const devices = opts.device ? [opts.device] : Object.keys(c.devices);
  for (const d of devices) if (!c.devices[d]) throw new Error(`unknown device ${d}`);
  const only = opts.only ? opts.only.split(",") : null;
  return devices.map((d) => ({
    device: d,
    dev: c.devices[d],
    shots: c.shots.filter((s) => s.devices.includes(d) && (!only || only.includes(s.name))),
  }));
}

function dirs(c, opts, device) {
  const root = path.join(c.outDir, opts.version || appVersion());
  return { root, raw: path.join(root, "source/raw", device), out: path.join(root, c.devices[device].folder) };
}

function prepare(c, opts) {
  return Object.fromEntries(plan(c, opts).map(({ device, dev }) => [device, sim.prepare(dev.simulator)]));
}

function capture(c, opts, udids) {
  for (const { device, dev, shots } of plan(c, opts)) {
    const udid = udids?.[device] || sim.prepare(dev.simulator);
    const { raw } = dirs(c, opts, device);
    for (const s of shots) {
      const out = path.join(raw, `${s.name}.png`);
      sim.capture(udid, s.route, out, s.wait || 4);
      console.log(`${device} ${s.name} → ${out}`);
    }
  }
}

function composeAll(c, opts) {
  for (const { device, dev } of plan(c, { ...opts, only: undefined })) {
    const shots = c.shots.filter((s) => s.devices.includes(device));
    const { raw, out, root } = dirs(c, opts, device);
    const files = compose(device, dev, shots, raw, out);
    const contact = sheet(files, path.join(root, `sheet-${device}.png`));
    if (contact) console.log(`contact sheet: ${contact}`);
  }
}

function main() {
  const opts = args(process.argv.slice(2));
  const c = config();
  switch (opts.cmd) {
    case "build": return build();
    case "prepare": return void prepare(c, opts);
    case "capture": return capture(c, opts);
    case "compose": return composeAll(c, opts);
    case "all": {
      build();
      const udids = prepare(c, opts);
      capture(c, opts, udids);
      return composeAll(c, opts);
    }
    case "cleanup": return sim.cleanup(Object.values(c.devices).map((d) => d.simulator));
    default: console.log(USAGE);
  }
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
