import { useCallback, useEffect, useState } from "react";
import { VideoSettingsInfo } from "../../bridge/commands";

// What video_settings_info reports about this Mac.
export interface VideoSettingsInfoValue {
  keySaved: boolean;
  videosDir: string | null;
}

// Null until the first answer, and where there is none (off a Mac, the demo).
export function useVideoSettingsInfo(): { info: VideoSettingsInfoValue | null; refresh: () => void } {
  const [info, setInfo] = useState<VideoSettingsInfoValue | null>(null);
  const refresh = useCallback(() => {
    VideoSettingsInfo()
      .then((next) => setInfo((next as VideoSettingsInfoValue | null) ?? null))
      .catch(() => setInfo(null));
  }, []);
  useEffect(refresh, [refresh]);
  return { info, refresh };
}
