import AlternativeCard from "./alternative-card";
import type { AlternativeGroup as Group } from "./alternatives-data";
import ScrollRegion from "./scroll-region";
import SwipeHint from "./swipe-hint";

export default function AlternativeGroup({ group }: { group: Group }) {
  const labelId = `alternatives-${group.id}`;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4 sm:block">
        <p
          id={labelId}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-700 dark:text-gray-300">
            {group.label}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {group.hint}
          </span>
        </p>
        <SwipeHint count={group.items.length} />
      </div>
      <ScrollRegion
        label={`Alternatives: ${group.label}`}
        className="scrollbar-none -mx-6 -my-1 snap-x snap-mandatory scroll-px-6 overflow-x-auto overscroll-x-contain py-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-900 sm:m-0 sm:snap-none sm:overflow-visible sm:p-0 dark:focus-visible:outline-white"
      >
        <ul
          aria-labelledby={labelId}
          className={`flex gap-3 pl-6 after:w-3 after:shrink-0 after:content-[''] sm:grid sm:grid-cols-2 sm:gap-4 sm:pl-0 sm:after:hidden ${
            group.items.length > 2 ? "lg:grid-cols-3" : ""
          }`}
        >
          {group.items.map((item) => (
            <li
              key={item.name}
              className="flex shrink-0 basis-[88%] snap-start sm:max-lg:odd:last:col-span-2"
            >
              <AlternativeCard alternative={item} />
            </li>
          ))}
        </ul>
      </ScrollRegion>
    </div>
  );
}
