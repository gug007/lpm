import { useId } from "react";
import PaceRange from "./pace-range";
import { WINDOW, durationShort, durationSpoken, type WindowKind } from "./pace-model";
import { PRESETS, PROVIDERS, type PresetId } from "./pace-presets";
import { SEGMENTED, SEGMENT_OFF, SEGMENT_ON } from "./page-styles";

const KINDS: WindowKind[] = ["fiveHour", "weekly"];

const CHIP =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors motion-reduce:transition-none";
const CHIP_ON = "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900";
const CHIP_OFF =
  "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white";

export default function PaceControls({
  kind,
  elapsedMinutes,
  used,
  presetId,
  onKind,
  onElapsed,
  onUsed,
  onPreset,
}: {
  kind: WindowKind;
  elapsedMinutes: number;
  used: number;
  presetId: PresetId | null;
  onKind: (kind: WindowKind) => void;
  onElapsed: (minutes: number) => void;
  onUsed: (percent: number) => void;
  onPreset: (id: PresetId) => void;
}) {
  const uid = useId();
  const win = WINDOW[kind];
  const elapsedReadout = elapsedMinutes > 0 ? durationShort(elapsedMinutes * 60000) : "0m";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={`${uid}-window`} className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Limit window
        </span>
        <div role="group" aria-labelledby={`${uid}-window`} className={SEGMENTED}>
          {KINDS.map((value) => {
            const pressed = kind === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={pressed}
                onClick={() => onKind(value)}
                className={`cursor-pointer max-sm:min-h-11 ${pressed ? SEGMENT_ON : SEGMENT_OFF}`}
              >
                {WINDOW[value].label}
              </button>
            );
          })}
        </div>
      </div>

      <PaceRange
        id={`${uid}-elapsed`}
        label="Time since the window started"
        min={0}
        max={win.max}
        step={win.step}
        value={elapsedMinutes}
        valueText={`${durationSpoken(elapsedMinutes)} of ${win.spoken}`}
        readout={`${elapsedReadout} of ${win.short}`}
        onChange={onElapsed}
      />

      <PaceRange
        id={`${uid}-used`}
        label="Used so far"
        min={0}
        max={100}
        step={1}
        value={used}
        valueText={`${used} percent used`}
        readout={`${used}%`}
        onChange={onUsed}
      />

      <div role="group" aria-label="Try a scenario" className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="mr-1 text-sm font-medium text-gray-500 dark:text-gray-400">
          Try:
        </span>
        {PRESETS.map(({ id, label, provider }) => {
          const pressed = presetId === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onPreset(id)}
              className={`${CHIP} ${pressed ? CHIP_ON : CHIP_OFF}`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: PROVIDERS[provider].dot }}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
