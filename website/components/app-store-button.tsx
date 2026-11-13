"use client";

import { trackAppStoreVisit, type AppStoreSource } from "@/lib/analytics";
import { APP_STORE_URL } from "@/lib/links";
import { OsIcon } from "@/components/home/os-icon";
import {
  STORE_BADGE,
  STORE_KICKER,
  STORE_NAME,
  STORE_OUTLINE,
} from "@/components/store-button-styles";

// "outline" is the quiet form for a page whose main action is something else.
export function AppStoreButton({
  source = "mobile-hero",
  variant = "badge",
}: {
  source?: AppStoreSource;
  variant?: "badge" | "outline";
}) {
  if (variant === "outline") {
    return (
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackAppStoreVisit(source)}
        className={STORE_OUTLINE}
      >
        <OsIcon os="macos" className="-mt-0.5 h-4 w-4 shrink-0" />
        lpm Link for iPhone · App Store
      </a>
    );
  }
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAppStoreVisit(source)}
      className={STORE_BADGE}
    >
      <OsIcon os="macos" className="h-7 w-7 flex-shrink-0 -mt-0.5 sm:h-6 sm:w-6" />
      <span className="flex flex-col items-start">
        <span className={STORE_KICKER}>Download on the</span>
        <span className={STORE_NAME}>App Store</span>
      </span>
      <span className="sr-only">: lpm Link for iPhone and iPad</span>
    </a>
  );
}
