// Screen capture of one rectangle (physical pixels) through ffmpeg's
// AVFoundation input, delivered as JPEG frames with their arrival time so the
// Recorder can lay them on a constant-rate timeline.
const { spawn, execFileSync } = require("child_process");

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

// AVFoundation's index for the main display changes with the cameras plugged in.
function listScreenDevice() {
  let out = "";
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = String(e.stderr || "");
  }
  const m = /\[(\d+)\] Capture screen 0/.exec(out);
  if (!m) throw new Error("ffmpeg lists no 'Capture screen 0' AVFoundation device");
  return m[1];
}

class Capture {
  constructor({ rect, fps = 30, onFrame }) {
    this.rect = rect;
    this.onFrame = onFrame;
    this.latest = null;
    this.frames = 0;
    this.err = "";
    const device = listScreenDevice();
    const crop = `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`;
    this.ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-nostats",
        "-f", "avfoundation", "-framerate", String(fps), "-pixel_format", "nv12",
        "-capture_cursor", "0", "-capture_mouse_clicks", "0",
        "-i", `${device}:none`,
        "-vf", crop, "-fps_mode", "passthrough", "-c:v", "mjpeg", "-q:v", "2", "-f", "image2pipe", "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    this.ffmpeg.stderr.on("data", (d) => (this.err += d));
    let buf = Buffer.alloc(0);
    this.ffmpeg.stdout.on("data", (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      let start;
      while ((start = buf.indexOf(SOI)) >= 0) {
        const end = buf.indexOf(EOI, start + 2);
        if (end < 0) break;
        const frame = buf.subarray(start, end + 2);
        buf = buf.subarray(end + 2);
        this.latest = frame;
        this.frames++;
        this.onFrame({ data: frame, timestamp: Date.now() });
      }
    });
    this.exited = new Promise((r) => this.ffmpeg.on("close", r));
  }

  async stop() {
    if (this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGINT");
    await Promise.race([this.exited, new Promise((r) => setTimeout(r, 3000))]);
    if (this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGKILL");
    if (!this.frames) throw new Error(`screen capture produced no frames: ${this.err.slice(-600)}`);
  }
}

module.exports = { Capture, listScreenDevice };
