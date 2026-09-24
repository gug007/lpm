import { Check, EqualNot, RotateCw, X, type LucideIcon } from "lucide-react";
import { STATE_LABEL, type ItemState } from "./explorer-data";

const LOOK: Record<ItemState, { icon: LucideIcon; tint: string }> = {
  present: {
    icon: Check,
    tint: "bg-emerald-100 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-300/20",
  },
  differs: {
    icon: EqualNot,
    tint: "bg-amber-100 text-amber-700 ring-amber-600/15 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-300/20",
  },
  missing: {
    icon: X,
    tint: "bg-rose-50 text-rose-500 ring-rose-500/15 dark:bg-rose-400/10 dark:text-rose-300/90 dark:ring-rose-300/20",
  },
  rebuilt: {
    icon: RotateCw,
    tint: "bg-gray-100 text-gray-500 ring-gray-500/15 dark:bg-white/[0.06] dark:text-gray-400 dark:ring-white/10",
  },
};

export default function FolderStatus({
  state,
  pop = false,
  srLabel = true,
}: {
  state: ItemState;
  pop?: boolean;
  srLabel?: boolean;
}) {
  const { icon: Icon, tint } = LOOK[state];
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${tint}${
        pop
          ? " transition-[opacity,scale] duration-300 ease-out starting:scale-50 starting:opacity-0 motion-reduce:transition-none"
          : ""
      }`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.75} aria-hidden />
      {srLabel && <span className="sr-only">{STATE_LABEL[state]}: </span>}
    </span>
  );
}
