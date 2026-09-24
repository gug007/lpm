import { CircleCheck, LoaderCircle } from "lucide-react";
import type { ToastView } from "./dialog-toast-sequence";

export default function DialogToast({ toast }: { toast: ToastView }) {
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {toast?.announce ?? ""}
      </p>
      {toast && (
        <div
          key={toast.id}
          aria-hidden
          className={`switcher-in absolute inset-x-3 bottom-[5.25rem] z-20 flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-[12.5px] font-medium leading-snug shadow-2xl shadow-black/50 sm:left-auto sm:right-6 sm:w-[19rem] ${
            toast.done
              ? "border-[#0e3b22] bg-[#04170e] text-[#5eeaa3]"
              : "border-[#333333] bg-black text-[#fcfcfc]"
          }`}
        >
          {toast.done ? (
            <CircleCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <LoaderCircle
              className="h-4 w-4 shrink-0 text-[#a3a3a3] motion-safe:animate-spin"
              strokeWidth={2}
            />
          )}
          <span className="min-w-0 flex-1 tabular-nums">{toast.text}</span>
        </div>
      )}
    </>
  );
}
