// Kokoro voices: accent and sex, then a name. Text to Speech and video
// narration both offer these.
export const KOKORO_VOICES = ["af_heart", "af_bella", "af_sarah", "am_adam", "am_michael", "bf_emma", "bm_george"];

export const DEFAULT_KOKORO_VOICE = "af_heart";

const ACCENTS: Record<string, string> = { a: "American", b: "British" };
const SEXES: Record<string, string> = { f: "female", m: "male" };

// "af_heart" → "Heart · American female"; an id in no known shape stays as is.
export function kokoroVoiceName(id: string): string {
  const m = /^([a-z])([fm])_([a-z]+)$/.exec(id);
  if (!m) return id;
  const name = m[3].charAt(0).toUpperCase() + m[3].slice(1);
  const accent = ACCENTS[m[1]];
  return accent ? `${name} · ${accent} ${SEXES[m[2]]}` : `${name} · ${SEXES[m[2]]}`;
}
