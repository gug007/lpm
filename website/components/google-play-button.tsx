"use client";

import { trackPlayStoreVisit, type AppStoreSource } from "@/lib/analytics";
import { PLAY_STORE_URL } from "@/lib/links";
import { GooglePlayIcon } from "@/components/google-play-icon";
import {
  STORE_BADGE,
  STORE_KICKER,
  STORE_NAME,
  STORE_OUTLINE,
} from "@/components/store-button-styles";

export function GooglePlayButton({
  source = "mobile-hero",
  variant = "badge",
}: {
  source?: AppStoreSource;
  variant?: "badge" | "outline";
}) {
  if (variant === "outline") {
    return (
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackPlayStoreVisit(source)}
        className={STORE_OUTLINE}
      >
        <GooglePlayIcon className="h-3.5 w-3.5 shrink-0" />
        lpm Link for Android · Google Play
      </a>
    );
  }
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackPlayStoreVisit(source)}
      className={STORE_BADGE}
    >
      <GooglePlayIcon className="h-6 w-6 flex-shrink-0 sm:h-5 sm:w-5" />
      <span className="flex flex-col items-start">
        <span className={STORE_KICKER}>Get it on</span>
        <span className={STORE_NAME}>Google Play</span>
      </span>
      <span className="sr-only">: lpm Link for Android</span>
    </a>
  );
}
