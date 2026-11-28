import { create } from "zustand";
import { toast } from "../notifications/toast";
import { EventsOnReady } from "../../bridge/runtime";
import {
  SetClipboardText,
  VoiceToTextCancel,
  VoiceToTextStart,
  VoiceToTextStop,
  VoiceToTextToggle,
} from "../../bridge/commands";
import { DICTATION_DELIVERED, insertDictation, type DictationTarget } from "../dictation/insert";

// lpm's own recorder over VoiceToText's app API. VoiceToText records and
// transcribes; the events it sends (relayed as `voice-to-text`) drive this
// store, and the transcript goes into the field that had focus at the start.

export type DictationPhase =
  | "idle"
  | "connecting"
  | "preparing"
  | "recording"
  | "transcribing"
  | "error";

export interface DictationError {
  code: string;
  message: string;
}

interface DictationState {
  phase: DictationPhase;
  modelName: string | null;
  // A live model streams words while recording (`partial`).
  live: boolean;
  // How far the model's download or load has got, 0…1, when VoiceToText knows.
  progress: number | null;
  startedAt: number | null;
  partial: string;
  error: DictationError | null;
  target: DictationTarget | null;
  start: (target: DictationTarget | null) => Promise<void>;
  stop: () => void;
  cancel: () => void;
  dismiss: () => void;
}

interface VoiceEvent {
  event: string;
  state?: string;
  model?: { name?: string; live?: boolean };
  progress?: number;
  level?: number;
  text?: string;
  code?: string;
  message?: string;
}

const RESTING = {
  phase: "idle" as DictationPhase,
  modelName: null,
  live: false,
  progress: null,
  startedAt: null,
  partial: "",
  error: null,
  target: null,
};

const ERROR_VISIBLE_MS = 7000;

// Read by the waveform every frame, so it lives outside React state.
let level = 0;
export const dictationLevel = () => level;

let starting = false;
let dismissTimer: ReturnType<typeof setTimeout> | undefined;
let listening: Promise<unknown> | null = null;

export const ACTIVE_PHASES: ReadonlySet<DictationPhase> = new Set([
  "connecting",
  "preparing",
  "recording",
  "transcribing",
]);

export const useDictationStore = create<DictationState>()((set, get) => {
  const reset = () => {
    clearTimeout(dismissTimer);
    level = 0;
    set(RESTING);
  };

  const fail = (code: string, message: string) => {
    clearTimeout(dismissTimer);
    level = 0;
    set({ phase: "error", error: { code, message }, partial: "" });
    dismissTimer = setTimeout(() => {
      if (get().phase === "error") reset();
    }, ERROR_VISIBLE_MS);
  };

  const enterRecording = (model: VoiceEvent["model"]) => {
    const { phase, startedAt } = get();
    if (phase !== "connecting" && phase !== "preparing" && phase !== "recording") return;
    set({
      phase: "recording",
      startedAt: startedAt ?? Date.now(),
      modelName: model?.name ?? get().modelName,
      live: model?.live ?? get().live,
      progress: null,
    });
  };

  const deliver = (text: string) => {
    const { target } = get();
    reset();
    if (!text) return;
    if (insertDictation(target, text)) {
      target?.element.dispatchEvent(new Event(DICTATION_DELIVERED));
      return;
    }
    SetClipboardText(text).then(
      () => toast.success("Transcript copied to the clipboard"),
      (err: unknown) => toast.error(`Could not copy the transcript: ${err}`),
    );
  };

  const onState = (e: VoiceEvent) => {
    const { phase } = get();
    switch (e.state) {
      case "preparing":
        if (phase === "connecting" || phase === "preparing") {
          set({
            phase: "preparing",
            modelName: e.model?.name ?? null,
            live: e.model?.live ?? false,
            progress: e.progress ?? null,
          });
        }
        return;
      case "recording":
        enterRecording(e.model);
        return;
      case "transcribing":
        if (phase === "recording") {
          level = 0;
          set({ phase: "transcribing" });
        }
        return;
      case "idle":
        // While connecting, an idle can only be the echo of a session cancelled
        // just before this one; a real failure arrives first as an `error`.
        if (phase !== "connecting" && phase !== "error") reset();
        return;
    }
  };

  const onEvent = (e: VoiceEvent) => {
    const { phase } = get();
    // Another window's session, or one this window already let go of.
    if (phase === "idle") return;
    switch (e.event) {
      case "level":
        if (phase === "recording") level = e.level ?? 0;
        return;
      case "state":
        onState(e);
        return;
      case "started":
        enterRecording(e.model);
        return;
      case "partial":
        if (phase === "recording" || phase === "transcribing") set({ partial: e.text ?? "" });
        return;
      case "transcript":
        deliver(e.text ?? "");
        return;
      case "error":
        if (phase !== "error") fail(e.code ?? "failed", e.message ?? "Dictation failed.");
        return;
      case "disconnected":
        if (phase !== "connecting" && phase !== "error") {
          fail("disconnected", "VoiceToText quit before the transcript was ready.");
        }
        return;
    }
  };

  const ensureListening = () => {
    listening ??= EventsOnReady("voice-to-text", onEvent).catch((err: unknown) => {
      listening = null;
      throw err;
    });
    return listening;
  };

  return {
    ...RESTING,

    start: async (target) => {
      const { phase } = get();
      if (starting || (phase !== "idle" && phase !== "error")) return;
      starting = true;
      reset();
      set({ phase: "connecting", target });
      try {
        await ensureListening();
        const mode = await VoiceToTextStart();
        if (get().phase === "idle") {
          // Cancelled while VoiceToText was starting up: the start went out
          // regardless, so take it back.
          if (mode === "api") void VoiceToTextCancel();
          return;
        }
        if (mode === "legacy") {
          // A VoiceToText from before the app API: its own recorder takes over
          // and pastes into the field that still has focus.
          reset();
          await VoiceToTextToggle();
        }
      } catch (err) {
        if (get().phase === "connecting") fail("unavailable", String(err));
      } finally {
        starting = false;
      }
    },

    stop: () => {
      if (get().phase !== "recording") return;
      level = 0;
      set({ phase: "transcribing" });
      VoiceToTextStop().catch((err: unknown) => fail("failed", String(err)));
    },

    cancel: () => {
      const { phase } = get();
      if (phase === "error") return reset();
      if (!ACTIVE_PHASES.has(phase)) return;
      // A start still on its way is taken back by `start` once it lands.
      if (phase !== "connecting" || !starting) void VoiceToTextCancel();
      reset();
    },

    dismiss: reset,
  };
});
