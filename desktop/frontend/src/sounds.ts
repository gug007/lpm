import { getSettings } from "./settings";

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

async function playTone(frequency: number, duration: number) {
  if (!getSettings().soundNotifications) return;
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") await ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playDoneSound() {
  playTone(880, 0.15);
  setTimeout(() => playTone(1320, 0.2), 120);
}

export function playWaitingSound() {
  playTone(660, 0.12);
  setTimeout(() => playTone(660, 0.12), 200);
}

export function playErrorSound() {
  playTone(440, 0.15);
  setTimeout(() => playTone(330, 0.25), 150);
}
