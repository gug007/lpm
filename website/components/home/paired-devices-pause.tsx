import { Pause, Play } from "lucide-react";

type Props = {
  paused: boolean;
  onToggle: () => void;
  className?: string;
};

export function MotionToggle({ paused, onToggle, className = "" }: Props) {
  const label = paused ? "Play animation" : "Pause animation";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white/85 text-gray-600 shadow-sm backdrop-blur-md transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:shadow-none dark:hover:border-white/25 dark:hover:text-white ${className}`}
    >
      {paused ? (
        <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />
      ) : (
        <Pause className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
