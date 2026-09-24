import { Check, Minus, X } from "lucide-react";

export type Verdict = "yes" | "no" | "partial" | "neutral";

const ICONS = {
  yes: { Icon: Check, tone: "text-emerald-600 dark:text-emerald-400" },
  no: { Icon: X, tone: "text-gray-500 dark:text-gray-400" },
  partial: { Icon: Minus, tone: "text-amber-600 dark:text-amber-400" },
} as const;

export default function VerdictIcon({
  verdict,
  className = "h-3.5 w-3.5",
}: {
  verdict: Verdict;
  className?: string;
}) {
  if (verdict === "neutral") {
    return (
      <span
        aria-hidden
        className={`${className} inline-flex shrink-0 items-center justify-center`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
      </span>
    );
  }
  const { Icon, tone } = ICONS[verdict];
  return (
    <Icon aria-hidden strokeWidth={2.5} className={`${className} shrink-0 ${tone}`} />
  );
}
