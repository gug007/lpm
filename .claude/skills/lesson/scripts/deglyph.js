// macOS draws a cursor accessory beside a focused field's caret (with Siri AI
// on, a round Siri glyph at the composer's left edge). It is drawn inside the
// app's own window, so the recorder can't leave it out, and no setting the take
// may change hides it. Before the render this finds the glyph in the raw
// capture (ffmpeg's find_rect, frame by frame, along the composer's left edge)
// and paints the edge as it is without it (the pane, the composer's border, its
// background, taken from just below the glyph) over each stretch it sits still.
// The capture it changed is kept beside it as record.with-glyph.mkv, and a
// record.deglyph.json stamp (naming the capture it covers) keeps a re-cut from
// doing it twice.
//
// node deglyph.js <record.mkv>   (also used by make.js)
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const TEMPLATE = path.join(__dirname, "glyph", "siri-cursor.pgm");
const COVER = path.join(__dirname, "glyph", "siri-cursor-cover.png");
// find_rect's score: 0 is an exact match. Matches measured ~0.016 at worst;
// frames without the glyph never came under 0.12.
const THRESHOLD = 0.12;
// Where the agent composer's left edge can be, in capture pixels (a 1100 pt
// wide window at 2x): its patch is only right there.
const SEARCH = { xmin: 380, xmax: 760, ymin: 150, ymax: 1220 };
// A stretch survives a missed frame or two (a frame mid-redraw); a longer gap
// between sightings ends it. The metadata lists only frames with a sighting.
const GAP_SECONDS = 0.12;
const FRAME = 1 / 30;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28 });

function probe(file) {
  const out = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt,color_range,color_space", "-of", "json", file]);
  return JSON.parse(out).streams[0];
}

// Each frame's time and where the glyph is in it, or null.
function detect(raw, log) {
  const meta = `${raw}.rects.txt`;
  const filter = [
    "format=gray",
    `find_rect=object=${TEMPLATE}:threshold=${THRESHOLD}:xmin=${SEARCH.xmin}:xmax=${SEARCH.xmax}:ymin=${SEARCH.ymin}:ymax=${SEARCH.ymax}`,
    `metadata=print:file=${meta}`,
  ].join(",");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-vf", filter, "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`glyph search failed: ${(r.stderr || "").slice(-300)}`);
  const frames = [];
  let cur = null;
  for (const line of fs.readFileSync(meta, "utf8").split("\n")) {
    const f = line.match(/^frame:\s*\d+\s+pts:\s*\S+\s+pts_time:([\d.]+)/);
    if (f) {
      cur = { t: Number(f[1]), at: null };
      frames.push(cur);
      continue;
    }
    const x = line.match(/^lavfi\.rect\.x=(\d+)/);
    const y = line.match(/^lavfi\.rect\.y=(\d+)/);
    if (cur && x) cur.at = { x: Number(x[1]) };
    if (cur && y && cur.at) cur.at.y = Number(y[1]);
  }
  fs.rmSync(meta, { force: true });
  log(`glyph: seen in ${frames.filter((f) => f.at).length} frames`);
  return frames;
}

// Stretches of sightings in one place, no more than GAP_SECONDS apart:
// [{ from, to, x, y }] in seconds, each running a frame past its last sighting.
function stretches(frames) {
  const out = [];
  let open = null;
  for (const f of frames) {
    if (!f.at) continue;
    if (open && open.x === f.at.x && open.y === f.at.y && f.t - open.last <= GAP_SECONDS) {
      open.last = f.t;
      continue;
    }
    open = { from: f.t, last: f.t, x: f.at.x, y: f.at.y };
    out.push(open);
  }
  return out.map(({ from, last, x, y }) => ({ from, to: last + FRAME, x, y }));
}

function deglyph(raw, log = console.log) {
  const stamp = path.join(path.dirname(raw), "record.deglyph.json");
  // The stamp names the capture it was written for: a new take's is done again.
  const id = () => {
    const st = fs.statSync(raw);
    return { size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  };
  if (fs.existsSync(stamp)) {
    const done = JSON.parse(fs.readFileSync(stamp, "utf8"));
    if (JSON.stringify(done.for) === JSON.stringify(id())) return done;
  }
  const spans = stretches(detect(raw, log));
  const result = { stretches: spans.length, seconds: Number(spans.reduce((n, s) => n + s.to - s.from, 0).toFixed(1)) };
  if (spans.length) {
    const info = probe(raw);
    const kept = path.join(path.dirname(raw), "record.with-glyph.mkv");
    const tmp = path.join(path.dirname(raw), "record.deglyph.tmp.mkv");
    // One overlay per stretch, each switched on for its own time span.
    const chain = [`[1]split=${spans.length}${spans.map((_, i) => `[c${i}]`).join("")}`];
    spans.forEach((s, i) => {
      const from = i === 0 ? "[0:v]" : `[v${i}]`;
      // The patch is one frame; overlay repeats it for the whole capture.
      chain.push(`${from}[c${i}]overlay=x=${s.x}:y=${s.y}:eof_action=repeat:enable='between(t,${s.from.toFixed(3)},${(s.to - 0.0005).toFixed(3)})'[v${i + 1}]`);
    });
    const r = spawnSync(
      "ffmpeg",
      [
        "-v", "error", "-y",
        "-i", raw,
        "-i", COVER,
        "-filter_complex", chain.join(";"),
        "-map", `[v${spans.length}]`,
        "-fps_mode", "passthrough",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "8",
        "-pix_fmt", info.pix_fmt,
        ...(info.color_range ? ["-color_range", info.color_range] : []),
        ...(info.color_space && info.color_space !== "unknown" ? ["-colorspace", info.color_space] : []),
        tmp,
      ],
      { encoding: "utf8", maxBuffer: 1 << 26 },
    );
    if (r.status !== 0) throw new Error(`glyph cover failed: ${(r.stderr || "").slice(-400)}`);
    fs.renameSync(raw, kept);
    fs.renameSync(tmp, raw);
    log(`glyph: covered ${result.seconds} s in ${spans.length} stretch(es); the capture as recorded is ${path.basename(kept)}`);
  }
  result.for = id();
  fs.writeFileSync(stamp, JSON.stringify(result));
  return result;
}

module.exports = { deglyph };

if (require.main === module) {
  const raw = process.argv[2];
  if (!raw) {
    console.error("usage: node deglyph.js <record.mkv>");
    process.exit(2);
  }
  console.log(JSON.stringify(deglyph(path.resolve(raw))));
}
