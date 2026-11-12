"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/consent";

export function ConsentSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      className="cursor-pointer underline hover:text-gray-900 dark:hover:text-gray-100"
    >
      Change your cookie choice
    </button>
  );
}
