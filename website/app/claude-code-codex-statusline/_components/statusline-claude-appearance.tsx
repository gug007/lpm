import { GitBranch } from "lucide-react";
import {
  claudeColors,
  meterStyles,
  separators,
  type ClaudeColorId,
  type MeterStyleId,
  type SeparatorId,
} from "./statusline-data";
import { StatuslineSwitch } from "./statusline-switch";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white";
const LEGEND = "text-xs font-semibold text-gray-700 dark:text-gray-300";

const COLOR_ENTRIES = Object.entries(claudeColors) as [
  ClaudeColorId,
  (typeof claudeColors)[ClaudeColorId],
][];
const SEPARATOR_ENTRIES = Object.entries(separators) as [
  SeparatorId,
  (typeof separators)[SeparatorId],
][];
const METER_ENTRIES = Object.entries(meterStyles) as [
  MeterStyleId,
  (typeof meterStyles)[MeterStyleId],
][];

export function StatuslineClaudeAppearance({
  itemLabel,
  color,
  onColor,
  separator,
  onSeparator,
  meterStyle,
  onMeterStyle,
  showIcons,
  onToggleIcons,
  showGitStatus,
  onToggleGitStatus,
  gitStatusAvailable,
}: {
  itemLabel: string;
  color: ClaudeColorId | undefined;
  onColor: (id: ClaudeColorId) => void;
  separator: SeparatorId;
  onSeparator: (id: SeparatorId) => void;
  meterStyle: MeterStyleId;
  onMeterStyle: (id: MeterStyleId) => void;
  showIcons: boolean;
  onToggleIcons: () => void;
  showGitStatus: boolean;
  onToggleGitStatus: () => void;
  gitStatusAvailable: boolean;
}) {
  return (
    <div className="mt-4 space-y-5">
      <fieldset>
        <legend className={LEGEND}>Color for {itemLabel}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOR_ENTRIES.map(([id, option]) => {
            const isActive = color === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onColor(id)}
                aria-pressed={isActive}
                aria-label={`${option.label} for ${itemLabel}`}
                title={option.label}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${FOCUS} ${
                  isActive
                    ? `border-transparent ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#171717] ${option.ring}`
                    : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                }`}
              >
                <span className={`h-3 w-3 rounded-full ${option.swatch}`} />
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LEGEND}>Separator</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SEPARATOR_ENTRIES.map(([id, option]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSeparator(id)}
              aria-pressed={separator === id}
              aria-label={`Use ${option.label}`}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-sm transition ${FOCUS} ${
                separator === id
                  ? "border-[#D97757] bg-[#D97757]/8 text-[#B75F40] dark:text-[#F09978]"
                  : "border-gray-200 text-gray-500 hover:border-gray-400 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-600"
              }`}
            >
              {option.value}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LEGEND}>Usage display</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METER_ENTRIES.map(([id, style]) => (
            <button
              key={id}
              type="button"
              onClick={() => onMeterStyle(id)}
              aria-pressed={meterStyle === id}
              className={`min-h-10 rounded-lg border px-2 text-left transition ${FOCUS} ${
                meterStyle === id
                  ? "border-[#D97757] bg-[#D97757]/8"
                  : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
              }`}
            >
              <span className="block truncate text-[10px] font-medium text-gray-700 dark:text-gray-300">
                {style.label}
              </span>
              <span
                className={`block truncate font-mono text-[10px] ${
                  meterStyle === id
                    ? "text-[#B75F40] dark:text-[#F09978]"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {style.sample}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-2">
        <StatuslineSwitch checked={showIcons} onToggle={onToggleIcons}>
          Show icons
        </StatuslineSwitch>
        <StatuslineSwitch
          checked={showGitStatus}
          onToggle={onToggleGitStatus}
          disabled={!gitStatusAvailable}
        >
          <GitBranch className="h-3.5 w-3.5" aria-hidden />
          Git status
        </StatuslineSwitch>
      </div>
    </div>
  );
}
