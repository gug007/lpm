// Turns the raw recording into the review video. The edit keeps each click's
// response and drops the waits between actions (edit.js); names of other
// people's Macs are blurred (redact.js); every click gets a ripple; the camera
// moves in on the part of a device a click changed (camera.js); the header
// names the device in view; each mark is a numbered caption; a title and a
// closing card bracket it all.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { activity } = require("./activity");
const { readLog, readEvents, keepSpans, outTime } = require("./edit");
const { redactions } = require("./redact");
const camera = require("./camera");
const { cards, W, H, HEADER, FOOTER, RIPPLE } = require("./cards");
const { track, toFrames } = require("../../lesson/scripts/keyframes");

const FPS = 30;

function probe(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(out);
  return { w: j.streams[0].width, h: j.streams[0].height, duration: Number(j.format.duration) };
}

function layoutFor(rec) {
  const stageW = W;
  const stageH = H - HEADER - FOOTER;
  const fit = Math.min((W - 160) / rec.rect.w, stageH / rec.rect.h);
  const vw = Math.round((rec.rect.w * fit) / 2) * 2;
  const vh = Math.round((rec.rect.h * fit) / 2) * 2;
  return { fit, vw, vh, stageW, stageH, ox: Math.round((W - vw) / 2), oy: Math.round((stageH - vh) / 2) };
}

// zoompan crops iw/zoom × ih/zoom around the eased centre and scales it back up.
function zoom(keys, stage) {
  const frames = toFrames(keys, FPS);
  const z = track(frames, 1, (k) => k.scale);
  const cx = track(frames, stage.w / 2, (k) => k.cx);
  const cy = track(frames, stage.h / 2, (k) => k.cy);
  return `zoompan=z='${z}':x='clip(${cx}-iw/zoom/2,0,iw-iw/zoom)':y='clip(${cy}-ih/zoom/2,0,ih-ih/zoom)':d=1:s=${stage.w}x${stage.h}:fps=${FPS}`;
}

async function render({ dir, version, build, device = "iPhone", cut, redact = [], camera: useCamera = true, title = 4, end = 4, log = console.log }) {
  const rec = JSON.parse(fs.readFileSync(path.join(dir, "recording.json"), "utf8"));
  const raw = path.join(dir, "raw.mov");
  const meta = probe(raw);
  const { marks, cuts } = readLog(dir, rec.startedAt, cut);
  const events = readEvents(dir, rec);
  const clicks = events.filter((e) => e.kind === "down");
  log(`raw ${meta.duration.toFixed(1)} s, ${meta.w}x${meta.h}; ${marks.length} steps, ${clicks.length} clicks, ${cuts.length} cuts`);
  if (!clicks.length) log("no input log (events.jsonl): cutting on pixel changes alone");
  const frames = await activity(raw, meta, rec);
  const spans = keepSpans({ frames, events, marks, cuts, duration: meta.duration });
  const main = outTime(spans, meta.duration);
  log(`kept ${spans.length} spans: ${main.toFixed(1)} s of ${meta.duration.toFixed(1)} s`);

  const layout = layoutFor(rec);
  const work = path.join(dir, "render");
  fs.mkdirSync(work, { recursive: true });
  const info = { version, build, device, date: new Date(rec.startedAt).toISOString().slice(0, 10) };
  cards(work, { rec, layout, marks, info });
  const blurs = redactions({ raw, spans, layout, keepName: rec.name, patterns: redact, work });
  log(`${blurs.length} blurred names`);
  const shot = useCamera ? camera.plan({ events, frames, rec, layout, spans, duration: meta.duration }) : { keys: [] };
  log(`${shot.keys.length} camera moves`);

  const at = marks.map((m) => outTime(spans, m.src));
  const select = spans.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
  const still = (file, seconds) => ["-loop", "1", "-framerate", String(FPS), "-t", String(seconds), "-i", path.join(work, file)];
  const inputs = ["-i", raw];
  const headers = { both: 1, mac: 2, phone: 3 };
  inputs.push(...still("header-both.png", main), ...still("header-mac.png", main), ...still("header-phone.png", main));
  const stepIn = 4;
  marks.forEach((_, i) => inputs.push(...still(`step-${i + 1}.png`, main)));
  const titleIn = stepIn + marks.length;
  inputs.push(...still("title.png", title), ...still("end.png", end));
  const rippleIn = titleIn + 2;
  inputs.push("-framerate", String(FPS), "-i", path.join(work, "ripple-%02d.png"));

  const g = [`[0:v]setpts=PTS-STARTPTS,fps=${FPS},select='${select}',setpts=N/${FPS}/TB,scale=${layout.vw}:${layout.vh}:flags=lanczos[s0]`];
  // One split feeds every blurred crop: a split per box, chained, makes each
  // frame request double per box and stalls ffmpeg past a dozen boxes.
  if (blurs.length) g.push(`[s0]split=${blurs.length + 1}[sb]${blurs.map((_, i) => `[c${i}]`).join("")}`);
  blurs.forEach((b, i) => {
    g.push(`[c${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},boxblur=luma_radius='min(12,min(w,h)/2-1)':chroma_radius='min(6,min(cw,ch)/2-1)':luma_power=2[b${i}]`);
    g.push(`[${i ? `s${i}` : "sb"}][b${i}]overlay=${b.x}:${b.y}:enable='between(t,${b.from.toFixed(3)},${b.to.toFixed(3)})'[s${i + 1}]`);
  });
  g.push(`color=c=black:s=${layout.stageW}x${layout.stageH}:r=${FPS}:d=${main.toFixed(3)}[cv]`);
  g.push(`[cv][s${blurs.length}]overlay=${layout.ox}:${layout.oy}:shortest=1[t0]`);
  const taps = clicks.map((c) => ({ t: outTime(spans, c.src), x: layout.ox + c.x * layout.fit, y: layout.oy + c.y * layout.fit }));
  if (taps.length) g.push(`[${rippleIn}:v]split=${taps.length}${taps.map((_, i) => `[r${i}]`).join("")}`);
  taps.forEach((tp, i) => {
    g.push(`[r${i}]setpts=PTS-STARTPTS+${tp.t.toFixed(3)}/TB[rr${i}]`);
    g.push(`[t${i}][rr${i}]overlay=${Math.round(tp.x - RIPPLE / 2)}:${Math.round(tp.y - RIPPLE / 2)}:eof_action=pass[t${i + 1}]`);
  });
  g.push(`[t${taps.length}]${shot.keys.length ? zoom(shot.keys, { w: layout.stageW, h: layout.stageH }) : "null"}[stage]`);
  g.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${main.toFixed(3)}[bg]`);
  g.push(`[bg][stage]overlay=0:${HEADER}:shortest=1[h0]`);
  const windows = camera.headerWindows(shot.keys, main);
  windows.forEach((w, i) => {
    g.push(`[h${i}][${headers[w.side]}:v]overlay=0:0:enable='between(t,${w.from.toFixed(3)},${w.to.toFixed(3)})'[h${i + 1}]`);
  });
  g.push(`[h${windows.length}]null[m0]`);
  marks.forEach((_, i) => {
    const to = (i + 1 < marks.length ? at[i + 1] : main + 1).toFixed(3);
    g.push(`[m${i}][${stepIn + i}:v]overlay=0:${H - FOOTER}:enable='between(t,${at[i].toFixed(3)},${to})'[m${i + 1}]`);
  });
  g.push(`[m${marks.length}]format=yuv420p,setsar=1[main]`);
  g.push(`[${titleIn}:v]format=yuv420p,setsar=1,fade=t=out:st=${title - 0.4}:d=0.4[title]`);
  g.push(`[${titleIn + 1}:v]format=yuv420p,setsar=1,fade=t=in:st=0:d=0.4[end]`);
  g.push(`[title][main][end]concat=n=3:v=1:a=0[out]`);
  const script = path.join(work, "graph.txt");
  fs.writeFileSync(script, g.join(";\n"));
  const out = path.join(dir, `lpm-link-${version}-app-review.mp4`);
  log("encoding");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-/filter_complex", script, "-map", "[out]", "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  const total = title + main + end;
  fs.writeFileSync(path.join(dir, "steps.txt"), marks.map((m, i) => `${fmt(title + at[i])}  ${i + 1}. ${m.text}${m.sub ? ` (${m.sub})` : ""}`).join("\n") + "\n");
  log(`${out}\n${fmt(total)} long, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB; step times in ${path.join(dir, "steps.txt")}`);
  return { out, duration: total };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

module.exports = { render };
