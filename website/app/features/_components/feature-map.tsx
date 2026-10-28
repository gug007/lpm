import { AREAS } from "./areas";
import { FEATURE_AREAS, FEATURE_COUNT } from "./feature-areas";
import MapSearchCell from "./map-search-cell";

export default function FeatureMap() {
  return (
    <nav aria-label="Feature map" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200 md:grid-cols-3 lg:grid-cols-4 dark:border-gray-800 dark:bg-gray-800">
        {FEATURE_AREAS.map((area) => {
          const meta = AREAS.find(({ id }) => id === area.id);
          if (!meta) return null;
          const Icon = meta.icon;
          const count = area.highlights.length + area.features.length;
          return (
            <li key={area.id} className="bg-white dark:bg-[#111]">
              <a
                href={`#${area.id}`}
                className="group flex h-full flex-col p-4 transition-colors duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 sm:p-5 dark:hover:bg-white/[0.03] dark:focus-visible:ring-white"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-colors duration-200 group-hover:bg-gray-900 group-hover:text-white dark:bg-white/[0.06] dark:text-gray-300 dark:group-hover:bg-white dark:group-hover:text-gray-900">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {count}
                    <span className="sr-only"> features</span>
                  </span>
                </span>
                <span className="mt-4 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                  {meta.eyebrow}
                </span>
                <span className="mt-2 hidden space-y-1 sm:block">
                  {area.highlights.map(({ title }) => (
                    <span
                      key={title}
                      className="block truncate text-[13px] leading-snug text-gray-500 dark:text-gray-400"
                    >
                      {title}
                    </span>
                  ))}
                </span>
              </a>
            </li>
          );
        })}
        <li className="bg-gray-900 dark:bg-white">
          <MapSearchCell total={FEATURE_COUNT} />
        </li>
      </ul>
    </nav>
  );
}
