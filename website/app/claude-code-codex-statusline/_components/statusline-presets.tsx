import { Check } from "lucide-react";
import type { StatuslinePreset } from "./statusline-data";

function sameItems(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

export function StatuslinePresets({
  presets,
  selectedIds,
  isClaude,
  onSelect,
}: {
  presets: StatuslinePreset[];
  selectedIds: string[];
  isClaude: boolean;
  onSelect: (items: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
          Choose a starting point
        </h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Every layout stays customizable.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {presets.map((preset) => {
          const isActive = sameItems(preset.items, selectedIds);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.items)}
              aria-pressed={isActive}
              className={`rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                isActive
                  ? isClaude
                    ? "border-[#D97757]/60 bg-[#D97757]/8"
                    : "border-[#10A37F]/60 bg-[#10A37F]/8"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.03]"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {preset.label}
                </span>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    isActive
                      ? isClaude
                        ? "border-[#D97757] bg-[#D97757] text-white"
                        : "border-[#10A37F] bg-[#10A37F] text-white"
                      : "border-gray-300 text-transparent dark:border-gray-700"
                  }`}
                  aria-hidden
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
