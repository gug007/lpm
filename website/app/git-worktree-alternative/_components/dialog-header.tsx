import { X } from "lucide-react";
import { PROJECT } from "./dialog-data";

export default function DialogHeader() {
  return (
    <div className="flex items-start gap-3 px-4 pb-1 pt-5 sm:px-6 sm:pt-6">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#22d3ee]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[#22d3ee]/20"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
          Duplicate
        </p>
        <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
          Create standalone copies of{" "}
          <span className="font-mono text-[var(--text-secondary)]">
            {PROJECT}
          </span>{" "}
          to run agents or services in parallel.
        </p>
      </div>
      <span
        aria-hidden
        className="-mr-1 -mt-1 ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)]"
      >
        <X className="h-4 w-4" />
      </span>
    </div>
  );
}
