import { Plus } from "lucide-react";
import type { StatuslineItem } from "./statusline-data";

export function StatuslineAddItems({
  items,
  isClaude,
  onAdd,
}: {
  items: StatuslineItem[];
  isClaude: boolean;
  onAdd: (id: string) => void;
}) {
  return (
    <div className="mt-7">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
        Add an item
      </h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {isClaude
          ? "Add project, model, usage, cost, or your own text."
          : "Codex hides fields automatically when no value is available."}
      </p>
      {items.length > 0 ? (
        <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAdd(item.id)}
              className="group flex min-h-14 items-start gap-2.5 rounded-xl border border-gray-200 p-3 text-left transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.03] dark:focus-visible:ring-white"
            >
              <Plus
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  isClaude ? "text-[#D97757]" : "text-[#10A37F]"
                }`}
                aria-hidden
              />
              <span>
                <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Every supported item is already in your statusline.
        </p>
      )}
    </div>
  );
}
