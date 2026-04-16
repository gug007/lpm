import { getAudioCtx } from "../sounds";

export interface TTSPlayer {
  play(audioData: ArrayBuffer): Promise<void>;
  enqueue(audioData: ArrayBuffer): void;
  pause(): void;
  resume(): void;
  stop(): void;
  seekBack(seconds: number): void;
  seekTo(seconds: number): void;
  onProgress(cb: (percent: number, elapsed: number, total: number) => void): void;
  onEnd(cb: () => void): void;
  isPlaying(): boolean;
}

export function createTTSPlayer(): TTSPlayer {
  const queue: ArrayBuffer[] = [];
  const history: AudioBuffer[] = [];
  let progressCb: ((percent: number, elapsed: number, total: number) => void) | null = null;
  let endCb: (() => void) | null = null;

  let currentSource: AudioBufferSourceNode | null = null;
  let currentChunkIdx = -1;
  let playing = false;
  let paused = false;
  let startTime = 0;
  let pauseOffset = 0;
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let totalDuration = 0;

  function chunkStartTime(): number {
    let t = 0;
    for (let i = 0; i < currentChunkIdx; i++) t += history[i].duration;
    return t;
  }

  function absolutePosition(): number {
    const base = chunkStartTime();
    if (paused) return base + pauseOffset;
    const ctx = getAudioCtx();
    return base + pauseOffset + (ctx.currentTime - startTime);
  }

  function reportProgress() {
    if (!progressCb || totalDuration === 0) return;
    const pos = absolutePosition();
    const percent = Math.min(100, (pos / totalDuration) * 100);
    progressCb(percent, pos, totalDuration);
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

  function stopSource() {
    if (currentSource) {
      currentSource.onended = null;
      currentSource.stop();
      currentSource.disconnect();
      currentSource = null;
    }
  }

  function finishIfDone() {
    if (playing) {
      stopProgressTracking();
      playing = false;
      reportProgress();
      endCb?.();
    }
  }

  function findChunkAt(pos: number): { idx: number; offset: number } | null {
    let idx = 0;
    let remaining = pos;
    while (idx < history.length && remaining > history[idx].duration) {
      remaining -= history[idx].duration;
      idx++;
    }
    return idx < history.length ? { idx, offset: remaining } : null;
  }

  function playChunkFrom(idx: number, offset: number): Promise<void> {
    const buf = history[idx];
    if (!buf) return Promise.resolve();

    currentChunkIdx = idx;
    pauseOffset = offset;

    return new Promise<void>((resolve) => {
      const ctx = getAudioCtx();
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      currentSource = source;

      source.onended = () => {
        source.disconnect();
        if (!playing) { resolve(); return; }
        currentSource = null;
        pauseOffset = 0;
        resolve();
      };

      startTime = ctx.currentTime;
      source.start(0, offset);
    });
  }

  async function playFrom(chunkIdx: number, offset: number): Promise<void> {
    await playChunkFrom(chunkIdx, offset);
    if (!playing) return;

    for (let i = chunkIdx + 1; i < history.length && playing; i++) {
      await playChunkFrom(i, 0);
      if (!playing) return;
    }

    while (queue.length > 0 && playing) {
      const data = queue.shift()!;
      const ctx = getAudioCtx();
      const buffer = await ctx.decodeAudioData(data);
      history.push(buffer);
      totalDuration += buffer.duration;
      await playChunkFrom(history.length - 1, 0);
      if (!playing) return;
    }
  }

  // Seek to an absolute position and resume playback from there.
  function seekToPosition(targetPos: number) {
    const target = findChunkAt(Math.max(0, Math.min(targetPos, totalDuration)));
    if (!target) return;
    stopSource();
    paused = false;
    playFrom(target.idx, target.offset).then(finishIfDone);
    startProgressTracking();
  }

  async function startPlayback(firstData: ArrayBuffer): Promise<void> {
    playing = true;
    paused = false;
    totalDuration = 0;
    history.length = 0;
    currentChunkIdx = -1;

    const ctx = getAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    const buffer = await ctx.decodeAudioData(firstData);
    history.push(buffer);
    totalDuration += buffer.duration;

    startProgressTracking();
    await playFrom(0, 0);
    stopProgressTracking();
    finishIfDone();
  }

  return {
    async play(audioData: ArrayBuffer): Promise<void> {
      if (playing) this.stop();
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
      stopSource();
      stopProgressTracking();
    },

    resume(): void {
      if (!playing || !paused || currentChunkIdx < 0) return;
      paused = false;
      playFrom(currentChunkIdx, pauseOffset).then(finishIfDone);
      startProgressTracking();
    },

    seekBack(seconds: number): void {
      if (!playing || currentChunkIdx < 0) return;
      seekToPosition(absolutePosition() - seconds);
    },

    seekTo(seconds: number): void {
      if (!playing || history.length === 0) return;
      seekToPosition(seconds);
    },

    stop(): void {
      playing = false;
      paused = false;
      stopProgressTracking();
      stopSource();
      currentChunkIdx = -1;
      queue.length = 0;
      history.length = 0;
      totalDuration = 0;
      pauseOffset = 0;
    },

    onProgress(cb: (percent: number, elapsed: number, total: number) => void): void {
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
