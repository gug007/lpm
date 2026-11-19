import { useVideoSettingsInfo } from "../../hooks/useVideoSettingsInfo";
import { isMac } from "../../platform";
import { saveSettings } from "../../store/settings";
import { CLOUD_PRICE, useVideoVoice } from "../../videoVoice";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { VideoFolderRow } from "./VideoFolderRow";
import { VideoNarratorControl } from "./VideoNarratorControl";
import { VideoOpenAIKeyRow } from "./VideoOpenAIKeyRow";
import { VideoSetupStatusRow } from "./VideoSetupStatusRow";
import { VideoVoiceRow } from "./VideoVoiceRow";

const NARRATOR_ABOUT = {
  local: "Free. Nothing leaves this Mac, and it speaks English only.",
  openai: `${CLOUD_PRICE} of narration, billed by OpenAI. The script's text goes to OpenAI; the recording stays here.`,
};

// Mounted only while the window is open, so the key and folder are read fresh
// each time it opens.
export function VideoSettingsBody() {
  const { narrator, voice } = useVideoVoice();
  const { info, refresh } = useVideoSettingsInfo();

  if (!isMac) {
    return (
      <p className="px-5 py-4 text-sm text-[var(--text-muted)]">
        Video answers are recorded on a Mac, so there's nothing to set here.
      </p>
    );
  }

  return (
    <div className="max-h-[65vh] overflow-y-auto px-5 pb-5 [&>:first-child]:mt-4">
      <SettingsSection title="Voice">
        <SettingsRow
          label="Narrator"
          description={`${NARRATOR_ABOUT[narrator]} Agent tabs opened from now on use it.`}
          stacked
        >
          <VideoNarratorControl value={narrator} onChange={(next) => void saveSettings({ videoNarrator: next })} />
        </SettingsRow>
        <VideoVoiceRow
          narrator={narrator}
          value={voice}
          onChange={(next) =>
            void saveSettings(narrator === "openai" ? { videoCloudVoice: next } : { videoLocalVoice: next })
          }
        />
        <VideoOpenAIKeyRow saved={info?.keySaved ?? false} needed={narrator === "openai"} onChange={refresh} />
      </SettingsSection>
      <SettingsSection title="Setup and files">
        <VideoSetupStatusRow />
        <VideoFolderRow dir={info?.videosDir ?? null} />
      </SettingsSection>
    </div>
  );
}
