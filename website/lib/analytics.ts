import type { MacDownloadPlatform } from "@/lib/use-platform";

declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
  }
}

export type DownloadPlatform = MacDownloadPlatform;
export type DownloadSource = "hero" | "downloads";

type TrackDownloadParams = {
  source: DownloadSource;
  platform: DownloadPlatform;
  href: string;
};

export function trackDownload({
  source,
  platform,
  href,
}: TrackDownloadParams): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "app_download", {
    source,
    platform,
    download_placement: source,
    download_architecture: platform,
    link_url: href,
    file_name: new URL(href).pathname.split("/").pop(),
  });
}
