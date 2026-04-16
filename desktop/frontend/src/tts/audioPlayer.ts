import { getAudioCtx } from "../sounds";

export interface TTSPlayer {
  play(audioData: ArrayBuffer): Promise<void>;
  enqueue(audioData: ArrayBuffer): void;
  pause(): void;
  resume(): void;
  stop(): void;
  onProgress(cb: (percent: number) => void): void;
  onEnd(cb: () => void): void;
  isPlaying(): boolean;
}

export function createTTSPlayer(): TTSPlayer {
  const queue: ArrayBuffer[] = [];
  let progressCb: ((percent: number) => void) | null = null;
  let endCb: (() => void) | null = null;

  let currentSource: AudioBufferSourceNode | null = null;
  let currentBuffer: AudioBuffer | null = null;
  let playing = false;
  let paused = false;
  let startTime = 0;
  let pauseOffset = 0;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  // Total duration across all chunks for progress tracking
  let totalDuration = 0;
  let completedDuration = 0;

  function reportProgress() {
    if (!progressCb || totalDuration === 0) return;
    const ctx = getAudioCtx();
    let elapsed = completedDuration;
    if (currentBuffer && playing && !paused) {
      elapsed += ctx.currentTime - startTime;
    } else if (paused) {
      elapsed += pauseOffset;
    }
    const percent = Math.min(100, (elapsed / totalDuration) * 100);
    progressCb(percent);
  }

  function startProgressTracking() {
    stopProgressTracking();
    progressTimer = setInterval(reportProgress, 100);
  }

  function stopProgressTracking() {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  async function playBuffer(data: ArrayBuffer): Promise<void> {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    const buffer = await ctx.decodeAudioData(data.slice(0));
    currentBuffer = buffer;
    totalDuration += buffer.duration;

    return new Promise<void>((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      currentSource = source;

      source.onended = () => {
        source.disconnect();
        if (!playing) {
          resolve();
          return;
        }
        completedDuration += buffer.duration;
        currentSource = null;
        currentBuffer = null;
        pauseOffset = 0;
        resolve();
      };

      startTime = ctx.currentTime;
      pauseOffset = 0;
      source.start(0);
    });
  }

  async function drainQueue(): Promise<void> {
    while (queue.length > 0 && playing) {
      const data = queue.shift()!;
      await playBuffer(data);
      if (!playing) return;
    }
  }

  async function startPlayback(firstChunk: ArrayBuffer): Promise<void> {
    playing = true;
    paused = false;
    completedDuration = 0;
    totalDuration = 0;

    startProgressTracking();

    await playBuffer(firstChunk);

    if (playing) {
      await drainQueue();
    }

    stopProgressTracking();

    if (playing) {
      playing = false;
      reportProgress();
      endCb?.();
    }
  }

  return {
    async play(audioData: ArrayBuffer): Promise<void> {
      if (playing) {
        this.stop();
      }
      await startPlayback(audioData);
    },

    enqueue(audioData: ArrayBuffer): void {
      queue.push(audioData);
    },

    pause(): void {
      if (!playing || paused || !currentSource) return;
      const ctx = getAudioCtx();
      paused = true;
      pauseOffset += ctx.currentTime - startTime;
      currentSource.onended = null;
      currentSource.stop();
      currentSource.disconnect();
      currentSource = null;
      stopProgressTracking();
    },

    resume(): void {
      if (!playing || !paused || !currentBuffer) return;
      paused = false;
      const ctx = getAudioCtx();
      const source = ctx.createBufferSource();
      source.buffer = currentBuffer;
      source.connect(ctx.destination);
      currentSource = source;

      source.onended = () => {
        if (!playing) return;
        completedDuration += currentBuffer!.duration;
        currentSource = null;
        currentBuffer = null;
        pauseOffset = 0;
        drainQueue().then(() => {
          if (playing) {
            stopProgressTracking();
            playing = false;
            reportProgress();
            endCb?.();
          }
        });
      };

      startTime = ctx.currentTime;
      source.start(0, pauseOffset);
      startProgressTracking();
    },

    stop(): void {
      playing = false;
      paused = false;
      stopProgressTracking();
      if (currentSource) {
        currentSource.onended = null;
        currentSource.stop();
        currentSource.disconnect();
        currentSource = null;
      }
      currentBuffer = null;
      queue.length = 0;
      totalDuration = 0;
      completedDuration = 0;
      pauseOffset = 0;
    },

    onProgress(cb: (percent: number) => void): void {
      progressCb = cb;
    },

    onEnd(cb: () => void): void {
      endCb = cb;
    },

    isPlaying(): boolean {
      return playing && !paused;
    },
  };
}
