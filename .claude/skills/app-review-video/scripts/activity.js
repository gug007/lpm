// What changed on screen, frame to frame: the raw recording sampled at 10 fps
// on a 640-wide gray copy, with the changed-pixel count and the box around the
// changes kept per window (the Mac's and the phone's), boxes in capture points.
const { spawn } = require("child_process");

const SAMPLE_W = 640;
const FLOOR = 16;

function activity(file, { w, h }, rec) {
  const sw = SAMPLE_W;
  const sh = Math.round((h * sw) / w / 2) * 2;
  const size = sw * sh;
  const k = sw / rec.rect.w;
  const phoneX0 = Math.round((rec.phone.x - rec.rect.x) * k);
  const phoneX1 = Math.round((rec.phone.x + rec.phone.w - rec.rect.x) * k);
  const toPoints = (b) => (b[2] < 0 ? null : [b[0] / k, b[1] / k, (b[2] + 1) / k, (b[3] + 1) / k]);
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", `setpts=PTS-STARTPTS,fps=10,scale=${sw}:${sh},format=gray`, "-f", "rawvideo", "pipe:1"]);
    const frames = [];
    let prev = null;
    let buf = Buffer.alloc(0);
    ff.stdout.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= size) {
        const frame = buf.subarray(0, size);
        buf = buf.subarray(size);
        let mac = 0;
        let phone = 0;
        const mb = [sw, sh, -1, -1];
        const pb = [sw, sh, -1, -1];
        if (prev) {
          for (let i = 0; i < size; i++) {
            if (Math.abs(frame[i] - prev[i]) <= FLOOR) continue;
            const x = i % sw;
            const y = (i - x) / sw;
            const onPhone = x >= phoneX0 && x < phoneX1;
            const b = onPhone ? pb : mb;
            if (onPhone) phone++;
            else mac++;
            if (x < b[0]) b[0] = x;
            if (y < b[1]) b[1] = y;
            if (x > b[2]) b[2] = x;
            if (y > b[3]) b[3] = y;
          }
        }
        frames.push({ mac, phone, macBox: toPoints(mb), phoneBox: toPoints(pb) });
        prev = Buffer.from(frame);
      }
    });
    ff.on("close", (code) => (code === 0 ? resolve(frames) : reject(new Error("ffmpeg activity pass failed"))));
  });
}

// A response worth showing: 1000+ changed pixels of the Mac or 450+ of the
// phone (it is a fifth of the frame). Under 120 is the pointer or a caret.
const strong = (f) => f.mac > 1000 || f.phone > 450;
const weak = (f) => f.mac + f.phone > 120;

module.exports = { activity, strong, weak };
