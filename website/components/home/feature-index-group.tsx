import type { IndexGroup, IndexGroupId } from "./feature-index-data";
import { FeatureIndexItem } from "./feature-index-item";

// Explicit bento placement: agents takes the tall middle column, so the two
// short groups stack under the two medium ones and every edge lines up.
const PLACEMENT: Record<IndexGroupId, string> = {
  run: "lg:col-start-1 lg:row-start-1",
  agents: "lg:col-start-2 lg:row-start-1 lg:row-span-2",
  ship: "lg:col-start-1 lg:row-start-2",
  monitor: "lg:col-start-3 lg:row-start-1",
  devices: "lg:col-start-3 lg:row-start-2",
};

export function FeatureIndexGroup({ group }: { group: IndexGroup }) {
  const { id, icon: Icon, title, blurb, items, note } = group;
  return (
    <div
      className={`flex flex-col rounded-3xl border border-gray-200 bg-gray-50/60 p-2 dark:border-gray-800 dark:bg-white/[0.02] ${PLACEMENT[id]}`}
    >
      <div className="flex items-center gap-3 px-3 pb-2 pt-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="text-[13px] leading-snug text-gray-500 dark:text-gray-400">
            {blurb}
          </p>
        </div>
      </div>
      <ul className="grid gap-0.5 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-1 lg:[&>li:last-child:nth-child(odd)]:col-span-1">
        {items.map((item) => (
          <FeatureIndexItem key={item.title} item={item} />
        ))}
      </ul>
      {note && (
        <div className="mt-auto px-3 pb-2 pt-2">
          <p className="border-t border-gray-200 pt-3 text-xs leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
