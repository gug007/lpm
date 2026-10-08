// Screen capture of one rectangle (physical pixels), delivered as JPEG frames
// with their arrival time so the Recorder can lay them on a constant-rate
// timeline. Given the lesson app's pid (or a list: the app and the iOS
// Simulator beside it), only those apps' windows are captured
// (appcap.swift, ScreenCaptureKit), so another app's window, a notification or
// a system dialog over the lesson never reaches the video; LESSON_CAPTURE=screen
// takes the whole screen through ffmpeg's AVFoundation input instead.
const { spawn, execFileSync } = require("child_process");
const { helper } = require("./helpers");

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

// The JPEG half of the capture: frames in, JPEG frames out on stdout.
const JPEG_OUT = ["-fps_mode", "passthrough", "-c:v", "mjpeg", "-q:v", "2", "-f", "image2pipe", "pipe:1"];

class Capture {
  constructor({ rect, fps = 30, onFrame, pid, scale = 2 }) {
    this.rect = rect;
    this.onFrame = onFrame;
    this.latest = null;
    this.frames = 0;
    this.err = "";
    if (pid && process.env.LESSON_CAPTURE !== "screen") {
      const pt = (v) => (v / scale).toFixed(2);
      this.source = spawn(
        helper("appcap"),
        [pid, pt(rect.x), pt(rect.y), pt(rect.w), pt(rect.h), rect.w, rect.h, fps].map(String),
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      this.source.stderr.on("data", (d) => (this.err += d));
      // The pixels arrive as sRGB; the take is read as full-range BT.709, as
      // the screen capture's frames are.
      this.ffmpeg = spawn(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostats",
          "-f", "rawvideo", "-pixel_format", "bgra", "-video_size", `${rect.w}x${rect.h}`, "-framerate", String(fps),
          "-i", "pipe:0",
          "-vf", "scale=out_color_matrix=bt709:out_range=pc,format=yuvj444p", ...JPEG_OUT,
        ],
        { stdio: [this.source.stdout, "pipe", "pipe"] },
      );
      this.source.on("close", (code) => {
        if (code && this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGINT");
      });
    } else {
      const device = listScreenDevice();
      const crop = `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`;
      this.ffmpeg = spawn(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostats",
          "-f", "avfoundation", "-framerate", String(fps), "-pixel_format", "nv12",
          "-capture_cursor", "0", "-capture_mouse_clicks", "0",
          "-i", `${device}:none`,
          "-vf", crop, ...JPEG_OUT,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    }
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
    if (this.source && this.source.exitCode == null) this.source.kill("SIGTERM");
    if (this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGINT");
    await Promise.race([this.exited, new Promise((r) => setTimeout(r, 3000))]);
    if (this.ffmpeg.exitCode == null) this.ffmpeg.kill("SIGKILL");
    if (!this.frames) throw new Error(`screen capture produced no frames: ${this.err.slice(-600)}`);
  }
}

module.exports = { Capture, listScreenDevice };
