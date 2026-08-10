import { create } from "zustand";
import { toast } from "sonner";
import { EventsOn } from "../../bridge/runtime";
import {
  StartTTS,
  StopTTS,
  PauseTTS,
  ResumeTTS,
  OpenAITTSSpeak,
} from "../../bridge/commands";
import { getSettings, saveSettings, useSettingsStore } from "./settings";
import { preprocessForTTS, resumeOffset } from "../tts/textProcessor";
import { createTTSPlayer, type TTSPlayer } from "../tts/audioPlayer";
import { base64ToBytes } from "../download";

export type TTSStatus = "idle" | "loading" | "playing" | "paused";

interface TTSState {
  status: TTSStatus;
  text: string;
  progress: number;
  duration: number;

  startReading: (text: string) => Promise<void>;
  stopReading: () => void;
  togglePause: () => void;
  seekBack: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  setSpeed: (speed: number) => void;
}

let player: TTSPlayer | null = null;

// Both engines bake the speed into the audio they hand back, so a speed change
// mid-reading can only be honored by asking for the rest of the text again.
// A reading is therefore one or more segments of the same text, and position is
// kept against the whole of it: `segStart` is where the current segment begins
// as a fraction of `fullText`, and the player's clip-relative progress is folded
// into that span before it reaches the UI.
let fullText = "";
let segStart = 0;
let segDuration = 0;
// Drops the engine's answer to a segment that has since been replaced.
let generation = 0;
// Speed changed while paused: honor it when the voice starts again, since
// re-synthesizing under a paused reading would start it talking.
let restartOnResume = false;

function resetReading() {
  generation++;
  fullText = "";
  segStart = 0;
  segDuration = 0;
  restartOnResume = false;
}

function getPlayer(): TTSPlayer {
  if (!player) {
    player = createTTSPlayer();
    player.onProgress((percent, _elapsed, duration) => {
      segDuration = duration;
      const span = 1 - segStart;
      useTTSStore.setState({
        progress: (segStart + (span * percent) / 100) * 100,
        duration: duration / span,
      });
    });
    player.onEnd(() => {
      resetReading();
      useTTSStore.setState({ status: "idle", text: "", progress: 0, duration: 0 });
    });
  }
  return player;
}

/**
 * Synthesize `fullText` from `fraction` onward and play it. Every reading goes
 * through here — a fresh one from 0, a speed change or a seek behind the current
 * segment from wherever the voice had reached.
 */
async function speakFrom(fraction: number) {
  const offset = resumeOffset(fullText, fraction);
  const segment = fullText.slice(offset).trim();
  if (!segment) {
    useTTSStore.getState().stopReading();
    return;
  }
  const mine = ++generation;
  segStart = offset / fullText.length;
  segDuration = 0;
  restartOnResume = false;
  getPlayer().stop();
  useTTSStore.setState({
    status: "loading",
    text: fullText,
    progress: segStart * 100,
  });

  // Kokoro streams chunked WAV back through "tts-audio" events; OpenAI
  // returns one encoded clip from a single call. Both end up in the same
  // player, so seeking and progress work identically either way.
  if (getSettings().ttsEngine === "openai") {
    try {
      const b64 = await OpenAITTSSpeak(segment);
      if (mine !== generation) return;
      const bytes = base64ToBytes(b64);
      useTTSStore.setState({ status: "playing" });
      void getPlayer().play(bytes.buffer as ArrayBuffer);
    } catch (err) {
      if (mine !== generation) return;
      resetReading();
      useTTSStore.setState({ status: "idle", text: "" });
      toast.error(`TTS failed: ${String(err)}`);
    }
    return;
  }
  try {
    await StartTTS(segment);
  } catch (err) {
    if (mine !== generation) return;
    resetReading();
    useTTSStore.setState({ status: "idle", text: "" });
    toast.error(`TTS failed: ${err}`);
  }
}

export const useTTSStore = create<TTSState>((set, get) => ({
  status: "idle",
  text: "",
  progress: 0,
  duration: 0,

  startReading: async (text) => {
    const cleaned = preprocessForTTS(text);
    if (!cleaned) {
      toast.error("No readable text in selection");
      return;
    }
    fullText = cleaned;
    await speakFrom(0);
  },

  stopReading: () => {
    // Harmless on the OpenAI path — there is no Rust-side session to tear down.
    StopTTS();
    getPlayer().stop();
    resetReading();
    set({ status: "idle", text: "", progress: 0, duration: 0 });
  },

  seekBack: (seconds: number) => {
    const { progress, duration } = get();
    get().seekTo((progress / 100) * duration - seconds);
  },

  // `seconds` is on the whole text's timeline. Anything inside the segment the
  // player holds is an instant seek; anything before it was synthesized in an
  // earlier segment that is gone, so the engine has to produce it again.
  seekTo: (seconds: number) => {
    const { duration } = get();
    if (duration <= 0) return;
    const fraction = Math.max(0, Math.min(1, seconds / duration));
    if (fraction < segStart || segDuration === 0) {
      void speakFrom(fraction);
      return;
    }
    getPlayer().seekTo(((fraction - segStart) / (1 - segStart)) * segDuration);
  },

  // Saving is the whole action: the engine is asked again at the new speed by
  // the subscription below, so the voice keeps its natural pitch either way.
  setSpeed: (speed: number) => {
    void saveSettings({ ttsSpeed: speed });
  },

  togglePause: () => {
    const { status, progress } = get();
    const openai = getSettings().ttsEngine === "openai";
    if (status === "playing") {
      if (!openai) PauseTTS(); // SIGSTOP only means something to the Kokoro child
      getPlayer().pause();
      set({ status: "paused" });
    } else if (status === "paused") {
      if (restartOnResume) {
        void speakFrom(progress / 100);
        return;
      }
      if (!openai) ResumeTTS();
      getPlayer().resume();
      set({ status: "playing" });
    }
  },

}));

export function initTTSEvents() {
  useSettingsStore.subscribe((s, prev) => {
    if (s.ttsSpeed === prev.ttsSpeed) return;
    const { status, progress } = useTTSStore.getState();
    if (status === "playing" || status === "loading") void speakFrom(progress / 100);
    else if (status === "paused") restartOnResume = true;
  });
  EventsOn("tts-state", (state: string) => {
    if (state === "error") {
      getPlayer().stop();
      resetReading();
      useTTSStore.setState({ status: "idle", text: "", progress: 0, duration: 0 });
      return;
    }
    // "stopped" means synthesis finished, not playback -- let player.onEnd
    // handle the idle transition when audio actually finishes.
    if (state === "stopped") return;
    useTTSStore.setState({ status: state as TTSStatus });
  });
  EventsOn("tts-error", (msg: string) => {
    toast.error(`TTS: ${msg}`);
  });
  EventsOn("tts-audio", (audioB64: string) => {
    const bytes = base64ToBytes(audioB64);
    const p = getPlayer();
    if (p.isPlaying()) {
      p.enqueue(bytes.buffer as ArrayBuffer);
    } else {
      p.play(bytes.buffer as ArrayBuffer);
    }
  });
}
