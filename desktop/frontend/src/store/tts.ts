import { create } from "zustand";
import { toast } from "sonner";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import {
  StartTTS,
  StopTTS,
  PauseTTS,
  ResumeTTS,
} from "../../wailsjs/go/main/App";
import { preprocessForTTS } from "../tts/textProcessor";
import { createTTSPlayer, type TTSPlayer } from "../tts/audioPlayer";

export type TTSStatus = "idle" | "loading" | "playing" | "paused";

interface TTSState {
  status: TTSStatus;
  text: string;
  progress: number;

  startReading: (text: string) => Promise<void>;
  stopReading: () => void;
  togglePause: () => void;
}

let player: TTSPlayer | null = null;

function getPlayer(): TTSPlayer {
  if (!player) {
    player = createTTSPlayer();
    player.onProgress((percent) => {
      useTTSStore.setState({ progress: percent });
    });
    player.onEnd(() => {
      useTTSStore.setState({ status: "idle", text: "", progress: 0 });
    });
  }
  return player;
}

export const useTTSStore = create<TTSState>((set, get) => ({
  status: "idle",
  text: "",
  progress: 0,

  startReading: async (text) => {
    const cleaned = preprocessForTTS(text);
    if (!cleaned) {
      toast.error("No readable text in selection");
      return;
    }
    set({ status: "loading", text: cleaned, progress: 0 });
    try {
      await StartTTS(cleaned);
    } catch (err) {
      set({ status: "idle", text: "" });
      toast.error(`TTS failed: ${err}`);
    }
  },

  stopReading: () => {
    StopTTS();
    getPlayer().stop();
    set({ status: "idle", text: "", progress: 0 });
  },

  togglePause: () => {
    const { status } = get();
    if (status === "playing") {
      PauseTTS();
      getPlayer().pause();
    } else if (status === "paused") {
      ResumeTTS();
      getPlayer().resume();
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
    const binary = atob(audioB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const p = getPlayer();
    if (p.isPlaying()) {
      p.enqueue(bytes.buffer as ArrayBuffer);
    } else {
      p.play(bytes.buffer as ArrayBuffer);
    }
  });
}
