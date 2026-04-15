"use client";

import { Check } from "lucide-react";
import { Spinner } from "./spinner";

export type BackgroundToast = {
  id: number;
  label: string;
  phase: "running" | "success";
};

export function BackgroundToasts({ toasts }: { toasts: BackgroundToast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-[70] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex min-w-[180px] items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 shadow-lg"
        >
          {t.phase === "running" ? (
            <Spinner className="h-3 w-3 text-gray-400" />
          ) : (
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
            </span>
          )}
          <span className="text-[11px] font-medium text-gray-700 dark:text-gray-200">
            {t.phase === "running" ? `${t.label}…` : `${t.label} done`}
          </span>
        </div>
      ))}
    </div>
  );
}
