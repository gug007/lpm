"use client";

import { useEffect } from "react";
import { CircleCheck, Info, X } from "lucide-react";

export type DemoNotice = {
  id: number;
  tone: "success" | "info";
  text: string;
};

const TONES = {
  success: {
    box: "border-[#0e3b22] bg-[#04170e] text-[#5eeaa3]",
    Icon: CircleCheck,
  },
  info: {
    box: "border-[#10284d] bg-[#050f1f] text-[#6aa8ff]",
    Icon: Info,
  },
} as const;

// The app's toasts sit top-right and clear themselves after five seconds; this
// one drops below the header and tab strip so it never covers their controls.
export function DemoToast({
  notice,
  onDismiss,
}: {
  notice: DemoNotice | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [notice, onDismiss]);

  if (!notice) return null;
  const { box, Icon } = TONES[notice.tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`absolute right-3 top-24 z-40 flex max-w-[300px] items-start gap-2 rounded-lg border px-3.5 py-3 text-[12px] font-medium leading-snug shadow-2xl ${box}`}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-my-3 -mr-3.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
