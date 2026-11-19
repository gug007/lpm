import { useShallow } from "zustand/react/shallow";
import { DEFAULT_KOKORO_VOICE, kokoroVoiceName } from "./kokoroVoices";
import { useSettingsStore, type Settings, type VideoNarrator } from "./store/settings";

// Who narrates a video answer, as the Video settings window and the Video
// button's hover card show it. explaincast voices on this Mac unless told
// otherwise.
const DEFAULT_CLOUD_VOICE = "marin";

// gpt-4o-mini-tts ($0.015/min) plus whisper-1 timing the words ($0.006/min).
export const CLOUD_PER_MINUTE = "$0.02";
export const CLOUD_PRICE = `≈ ${CLOUD_PER_MINUTE} a minute`;

// OpenAI's own pick for the best-sounding voices.
const RECOMMENDED_CLOUD_VOICES = ["marin", "cedar"];

export interface VideoVoice {
  narrator: VideoNarrator;
  voice: string;
}

function videoVoiceOf(settings: Pick<Settings, "videoNarrator" | "videoLocalVoice" | "videoCloudVoice">): VideoVoice {
  return settings.videoNarrator === "openai"
    ? { narrator: "openai", voice: settings.videoCloudVoice ?? DEFAULT_CLOUD_VOICE }
    : { narrator: "local", voice: settings.videoLocalVoice ?? DEFAULT_KOKORO_VOICE };
}

export function useVideoVoice(): VideoVoice {
  return useSettingsStore(useShallow(videoVoiceOf));
}

// One line: who voices it, and what that costs.
export function videoVoiceSummary({ narrator, voice }: VideoVoice): { label: string; cost: string } {
  return narrator === "openai"
    ? { label: `OpenAI voice, ${voice}`, cost: CLOUD_PRICE }
    : { label: "Voiced on this Mac", cost: "free" };
}

// A voice as the settings window lists it: "Heart · American female" rather
// than af_heart.
export function videoVoiceName(narrator: VideoNarrator, voice: string): string {
  if (narrator === "local") return kokoroVoiceName(voice);
  const name = voice.charAt(0).toUpperCase() + voice.slice(1);
  return RECOMMENDED_CLOUD_VOICES.includes(voice) ? `${name} · recommended` : name;
}
