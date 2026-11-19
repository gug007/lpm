import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { useVideoSettingsInfo } from "../../hooks/useVideoSettingsInfo";
import { isMac } from "../../platform";
import { saveSettings } from "../../store/settings";
import { useVideoSetup } from "../../store/videoSetup";
import { useVideoVoice } from "../../videoVoice";
import { SettingsSection } from "../SettingsSection";
import { CAPS_LABEL } from "../settings/sectionStyles";
import { BTN_PRIMARY } from "../ui/buttons";
import { VideoNarratorCards } from "./VideoNarratorCards";
import { VideoOpenAIKeyRow } from "./VideoOpenAIKeyRow";
import { VideoReadiness } from "./VideoReadiness";
import { VideoVoiceRow } from "./VideoVoiceRow";

// Mounted only while the window is open, so the key and folder are read fresh
// each time it opens. Only the picked narrator's settings show under the cards.
export function VideoSettingsBody({ onDone }: { onDone: () => void }) {
  const { narrator, voice } = useVideoVoice();
  const { info, refresh } = useVideoSettingsInfo();
  const localVoiceReady = useVideoSetup((s) => s.parts?.find((p) => p.id === "voice")?.ready ?? null);
  const keySaved = info ? info.keySaved : null;

  const footer = (status: ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
      {status}
      <button type="button" onClick={onDone} className={`${BTN_PRIMARY} ml-auto shrink-0`}>
        Done
      </button>
    </div>
  );

  if (!isMac) {
    return (
      <>
        <p className="px-5 py-4 text-sm text-[var(--text-muted)]">
          Video answers are recorded on a Mac, so there's nothing to set here.
        </p>
        {footer(null)}
      </>
    );
  }

  const sampleUnavailable =
    narrator === "local"
      ? localVoiceReady === false
        ? "Install the local voice to hear it"
        : null
      : keySaved === false
        ? "Save your key to hear it"
        : null;

  return (
    <>
      <div className="max-h-[65vh] overflow-y-auto px-5 pb-5">
        <p className={`mt-4 mb-2 px-0.5 ${CAPS_LABEL}`}>Who narrates</p>
        <VideoNarratorCards
          value={narrator}
          onChange={(next) => void saveSettings({ videoNarrator: next })}
          keySaved={keySaved}
          localVoiceReady={localVoiceReady}
        />
        <SettingsSection title={narrator === "openai" ? "Voice and key" : "Voice"}>
          <VideoVoiceRow
            key={narrator}
            narrator={narrator}
            value={voice}
            sampleUnavailable={sampleUnavailable}
            onChange={(next) =>
              void saveSettings(narrator === "openai" ? { videoCloudVoice: next } : { videoLocalVoice: next })
            }
          />
          {narrator === "openai" && <VideoOpenAIKeyRow saved={keySaved} onChange={refresh} />}
        </SettingsSection>
        <p className="mt-3 flex items-center gap-1.5 px-0.5 text-[11.5px] text-[var(--text-muted)]">
          <Info aria-hidden size={13} className="shrink-0" />
          Agent tabs you open next use this voice. Open tabs keep theirs.
        </p>
      </div>
      {footer(<VideoReadiness narrator={narrator} keySaved={keySaved} videosDir={info?.videosDir ?? null} />)}
    </>
  );
}
