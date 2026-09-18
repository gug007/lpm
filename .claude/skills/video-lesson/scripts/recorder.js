const { spawn } = require("child_process");

const FPS = 30;

// Turns the screencast's JPEG frames into a constant-rate near-lossless file, the way
// a screen recorder would: each frame holds its slot until the next one lands,
// and the clock starts at the first frame that differs from the stale opener
// Chrome sends before the page has painted.
class Recorder {
  constructor(file) {
    this.file = file;
    this.first = null;
    this.startWall = 0;
    this.startTs = 0;
    this.last = null;
    this.lastN = -1;
    this.ffmpeg = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv444p", file],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    this.err = "";
    this.ffmpeg.stderr.on("data", (d) => (this.err += d));
  }

  get started() {
    return this.startWall > 0;
  }

  frame(f) {
    const data = Buffer.from(f.data);
    if (!this.first) {
      this.first = data;
      return;
    }
    if (!this.started) {
      if (data.equals(this.first)) return;
      this.startWall = Date.now();
      this.startTs = f.timestamp;
    }
    const n = Math.max(0, Math.floor(((f.timestamp - this.startTs) / 1000) * FPS));
    if (this.last && n > this.lastN) this.emit(n - this.lastN);
    this.last = data;
    this.lastN = Math.max(n, this.lastN);
  }

  emit(times) {
    for (let i = 0; i < times; i++) this.ffmpeg.stdin.write(this.last);
  }

  async stop(totalMs) {
    const endN = Math.floor((totalMs / 1000) * FPS);
    if (this.last) this.emit(Math.max(1, endN - this.lastN));
    this.ffmpeg.stdin.end();
    const code = await new Promise((r) => this.ffmpeg.on("close", r));
    if (code !== 0) throw new Error(`recorder ffmpeg failed: ${this.err.slice(-500)}`);
  }
}

module.exports = { Recorder, FPS };
