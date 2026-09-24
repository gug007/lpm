import { ArrowRight } from "lucide-react";

export default function SwipeHint({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-gray-500 sm:hidden dark:text-gray-400"
    >
      {count} options · swipe
      <ArrowRight className="h-3 w-3" />
    </span>
  );
}
