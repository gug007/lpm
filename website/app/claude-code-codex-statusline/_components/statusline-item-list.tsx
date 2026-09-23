import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { StatuslineItem } from "./statusline-data";

const ICON_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-25 dark:text-gray-400";

export function StatuslineItemList({
  items,
  isClaude,
  editingId,
  onEdit,
  onMove,
  onRemove,
}: {
  items: StatuslineItem[];
  isClaude: boolean;
  editingId: string;
  onEdit: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
            Arrange your items
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Move, edit, or remove each signal.
          </p>
        </div>
        <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 dark:border-gray-700 dark:bg-black/20 dark:text-gray-400">
          Statusline hidden. Add an item below to turn it back on.
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const isEditing = isClaude && editingId === item.id;
            return (
              <li
                key={item.id}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-2.5 transition-colors ${
                  isEditing
                    ? "border-[#D97757]/50 bg-[#D97757]/7 dark:bg-[#D97757]/10"
                    : "border-gray-200 bg-gray-50/70 dark:border-gray-700/60 dark:bg-white/[0.04]"
                }`}
              >
                <span className="w-5 text-center font-mono text-[11px] text-gray-500 dark:text-gray-400">
                  {index + 1}
                </span>
                {isClaude ? (
                  <button
                    type="button"
                    onClick={() => onEdit(item.id)}
                    className={`min-w-0 flex-1 cursor-pointer truncate rounded-md py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                      isEditing
                        ? "text-[#B75F40] dark:text-[#F09978]"
                        : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {item.label}
                    {isEditing && (
                      <span className="ml-2 inline-flex -translate-y-px items-center rounded-full bg-[#D97757]/12 px-2 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-[0.08em] dark:bg-[#D97757]/18">
                        Editing
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                    {item.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onMove(item.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} left`}
                  className={`${ICON_BUTTON} hover:bg-white hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.id, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${item.label} right`}
                  className={`${ICON_BUTTON} hover:bg-white hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white`}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={isClaude && items.length === 1}
                  aria-label={`Remove ${item.label}`}
                  className={`${ICON_BUTTON} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
