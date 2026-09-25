const BUTTON =
  "min-h-11 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 sm:min-h-9 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white";

type Props = {
  note: string | null;
  skipLabel: string | null;
  onSkip: () => void;
  onRestart: () => void;
};

export default function ResetDemoControls({ note, skipLabel, onSkip, onRestart }: Props) {
  return (
    <div role="group" aria-label="Demo controls" className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {note && (
        <p aria-hidden className="w-full text-pretty text-center text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          {note}
        </p>
      )}
      <span aria-hidden className="w-full text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:w-auto dark:text-gray-400">
        Demo controls
      </span>
      {skipLabel && (
        <button type="button" onClick={onSkip} className={BUTTON}>
          {skipLabel}
        </button>
      )}
      <button type="button" data-focus="restart" onClick={onRestart} className={BUTTON}>
        Start over
      </button>
    </div>
  );
}
