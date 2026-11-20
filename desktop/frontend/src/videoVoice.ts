import { useShallow } from "zustand/react/shallow";
import { DEFAULT_KOKORO_VOICE, kokoroVoiceName, kokoroVoiceShortName } from "./kokoroVoices";
import { useSettingsStore, type Settings, type VideoNarrator } from "./store/settings";

// Who narrates a video answer, as the Video settings window and the Video
// button's hover card show it. explaincast voices on this Mac unless told
// otherwise.
const DEFAULT_CLOUD_VOICE = "marin";

// gpt-4o-mini-tts ($0.015/min) plus whisper-1 timing the words ($0.006/min).
export const CLOUD_PER_MINUTE = "$0.02";

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

// One line, the same three parts either way: the voice, where it runs, and
// what that costs.
export function videoVoiceSummary({ narrator, voice }: VideoVoice): { name: string; where: string; cost: string } {
  const name = videoVoiceShortName(narrator, voice);
  return narrator === "openai"
    ? { name, where: "OpenAI", cost: `${CLOUD_PER_MINUTE}/min` }
    : { name, where: "this Mac", cost: "free" };
}

// The name alone: "Heart", "Marin".
export function videoVoiceShortName(narrator: VideoNarrator, voice: string): string {
  return narrator === "local" ? kokoroVoiceShortName(voice) : voice.charAt(0).toUpperCase() + voice.slice(1);
}

// A voice as the settings window lists it: "Heart · American female" rather
// than af_heart.
export function videoVoiceName(narrator: VideoNarrator, voice: string): string {
  if (narrator === "local") return kokoroVoiceName(voice);
  const name = videoVoiceShortName(narrator, voice);
  return RECOMMENDED_CLOUD_VOICES.includes(voice) ? `${name} · recommended` : name;
}
