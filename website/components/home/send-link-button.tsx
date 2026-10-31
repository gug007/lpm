"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";
import { SITE_URL } from "@/lib/links";

const DOWNLOAD_URL = `${SITE_URL}/#download`;

type SendState = "idle" | "copied" | "failed";

// lpm installs on a computer, so a phone's useful move is getting this page
// there: the share sheet reaches AirDrop and Messages, and browsers without
// one copy the link instead.
export function useSendLink() {
  const [state, setState] = useState<SendState>("idle");

  const send = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "lpm", url: DOWNLOAD_URL });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(DOWNLOAD_URL);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return { state, send };
}

const VARIANT = {
  outline:
    "min-h-11 border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white",
  primary:
    "min-h-14 w-full max-w-xs justify-center gap-2.5 bg-gray-900 px-6 text-[17px] font-semibold text-white shadow-sm hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100",
  menu: "min-h-11 w-full justify-center bg-gray-900 px-5 text-[15px] font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100",
};

export function SendLinkFailed() {
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400">
      Open <span className="font-medium select-all">lpm.cx</span> on your
      computer to download.
    </p>
  );
}

export function SendLinkButton({
  align = "center",
  variant = "outline",
  label = "Send the link to your computer",
}: {
  align?: "center" | "start";
  variant?: keyof typeof VARIANT;
  label?: string;
}) {
  const { state, send } = useSendLink();
  const Icon = state === "copied" ? Check : Share;

  return (
    <div
      className={`flex w-full flex-col gap-2 ${align === "start" ? "items-start" : "items-center"}`}
    >
      <button
        type="button"
        onClick={send}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-full transition-colors ${VARIANT[variant]}`}
      >
        <Icon
          className={variant === "primary" ? "h-5 w-5" : "h-4 w-4"}
          aria-hidden
        />
        {state === "copied" ? "Link copied" : label}
      </button>
      {state === "failed" && <SendLinkFailed />}
    </div>
  );
}
