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
import { getSettings } from "./settings";
import { preprocessForTTS } from "../tts/textProcessor";
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
}

let player: TTSPlayer | null = null;

function getPlayer(): TTSPlayer {
  if (!player) {
    player = createTTSPlayer();
    player.onProgress((percent, _elapsed, duration) => {
      useTTSStore.setState({ progress: percent, duration });
    });
    player.onEnd(() => {
      useTTSStore.setState({ status: "idle", text: "", progress: 0, duration: 0 });
    });
  }
  return player;
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
    set({ status: "loading", text: cleaned, progress: 0 });
    // Kokoro streams chunked WAV back through "tts-audio" events; OpenAI
    // returns one encoded clip from a single call. Both end up in the same
    // player, so seeking and progress work identically either way.
    if (getSettings().ttsEngine === "openai") {
      try {
        const b64 = await OpenAITTSSpeak(cleaned);
        const bytes = base64ToBytes(b64);
        await getPlayer().play(bytes.buffer as ArrayBuffer);
        set({ status: "playing" });
      } catch (err) {
        set({ status: "idle", text: "" });
        toast.error(`TTS failed: ${String(err)}`);
      }
      return;
    }
    try {
      await StartTTS(cleaned);
    } catch (err) {
      set({ status: "idle", text: "" });
      toast.error(`TTS failed: ${err}`);
    }
  },

  stopReading: () => {
    // Harmless on the OpenAI path — there is no Rust-side session to tear down.
    StopTTS();
    getPlayer().stop();
    set({ status: "idle", text: "", progress: 0 });
  },

  seekBack: (seconds: number) => {
    getPlayer().seekBack(seconds);
  },

  seekTo: (seconds: number) => {
    getPlayer().seekTo(seconds);
  },

  togglePause: () => {
    const { status } = get();
    const openai = getSettings().ttsEngine === "openai";
    if (status === "playing") {
      if (!openai) PauseTTS(); // SIGSTOP only means something to the Kokoro child
      getPlayer().pause();
      set({ status: "paused" });
    } else if (status === "paused") {
      if (!openai) ResumeTTS();
      getPlayer().resume();
      set({ status: "playing" });
    }
  },

}));

export function initTTSEvents() {
  EventsOn("tts-state", (state: string) => {
    if (state === "error") {
      getPlayer().stop();
      useTTSStore.setState({ status: "idle", text: "", progress: 0 });
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
