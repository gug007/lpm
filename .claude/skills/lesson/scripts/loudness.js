// Measurements of an audio filter graph's [out] label: integrated loudness,
// overall RMS, and how bright a voice is (energy above 4 kHz against the whole
// band), each by one ffmpeg pass.
const { spawnSync } = require("child_process");

function measure(inputs, filter, tail) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", ...inputs, "-filter_complex", `${filter};[out]${tail}[m]`, "-map", "[m]", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  return r.stderr || "";
}

// Integrated loudness (LUFS) and true peak (dBTP).
function loudness(inputs, filter) {
  const err = measure(inputs, filter, "ebur128=framelog=quiet:peak=true");
  const summary = err.split("Summary").pop() || "";
  const i = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary);
  const tp = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary);
  if (!i) throw new Error(`loudness measurement failed:\n${err.slice(-800)}`);
  return { lufs: parseFloat(i[1]), peak: tp ? parseFloat(tp[1]) : null };
}

const lufs = (inputs, filter) => loudness(inputs, filter).lufs;

function rmsDb(inputs, filter, pre = "") {
  const err = measure(inputs, filter, `${pre}astats=measure_perchannel=none:measure_overall=RMS_level`);
  const m = /RMS level dB:\s+(-?[\d.]+|-inf)/.exec(err.split("Overall").pop() || "");
  if (!m) throw new Error(`level measurement failed:\n${err.slice(-800)}`);
  return parseFloat(m[1]);
}

// dB of energy above 4 kHz relative to the full band; silence cancels out.
function brightness(inputs, filter) {
  return rmsDb(inputs, filter, "highpass=f=4000,highpass=f=4000,") - rmsDb(inputs, filter);
}

module.exports = { loudness, lufs, rmsDb, brightness };
