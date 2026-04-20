declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
  }
}

export type DownloadPlatform = "mac-arm" | "mac-intel";
export type DownloadSource = "hero" | "downloads";

type TrackDownloadParams = {
  source: DownloadSource;
  platform: DownloadPlatform;
};

export function trackDownload(params: TrackDownloadParams): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "app_download", params);
}
