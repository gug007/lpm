"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  asksForConsent,
  CONSENT_OPEN_EVENT,
  readChoice,
  saveChoice,
  type ConsentChoice,
} from "@/lib/consent";
import { PRIVACY_PATH } from "@/lib/links";

// Both answers look the same, so declining is as easy as allowing.
const CHOICE =
  "inline-flex min-h-9 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-[13px] font-medium text-gray-800 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white";

// Shown to visitors from the countries in lib/consent.ts until they answer,
// and to anyone who asks for it again from the privacy page. It sits bottom
// left, clear of the install note that a download opens bottom right.
export function ConsentBanner() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const show = () => setOpen(true);
    const frame = requestAnimationFrame(() => {
      if (asksForConsent() && readChoice() === null) show();
    });
    window.addEventListener(CONSENT_OPEN_EVENT, show);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(CONSENT_OPEN_EVENT, show);
    };
  }, []);

  // /join runs no third-party script, so there is nothing to ask about there.
  if (!open || pathname === "/join") return null;

  const choose = (choice: ConsentChoice) => {
    saveChoice(choice);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl transition-[opacity,translate] duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none sm:right-auto sm:bottom-6 sm:left-6 sm:w-[380px] dark:border-gray-800 dark:bg-[#161616]"
    >
      <p id={titleId} className="text-sm font-semibold text-gray-900 dark:text-white">
        Cookies on lpm.cx
      </p>
      <p
        id={bodyId}
        className="mt-1.5 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400"
      >
        We&rsquo;d like to use Google Analytics and Google Ads cookies to count
        visits and see which ads work. The app itself never sends either.
      </p>
      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <Link
          href={`${PRIVACY_PATH}#website-analytics`}
          className="mr-auto inline-flex min-h-9 items-center text-[13px] text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-400 dark:decoration-gray-600 dark:hover:text-white"
        >
          Privacy
        </Link>
        <button type="button" onClick={() => choose("denied")} className={CHOICE}>
          Decline
        </button>
        <button type="button" onClick={() => choose("granted")} className={CHOICE}>
          Allow
        </button>
      </div>
    </div>
  );
}
