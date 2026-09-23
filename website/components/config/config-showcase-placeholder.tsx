import { ConfigYaml } from "@/components/config/config-showcase-yaml";
import {
  CONFIG_EXAMPLE,
  CONFIG_FILENAME,
  EDITOR_HEIGHT,
  PREVIEW_HEIGHT,
  TOOLBAR_HEIGHT,
} from "@/components/config/config-showcase-data";

// Holds the playground's exact footprint until its chunk arrives, so the swap
// never moves the page. The code is real; only the app preview is sketched.
export function ConfigPlaceholder() {
  return (
    <div className="mb-6">
      <div className="replica-ui overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div
          className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 dark:border-gray-800 dark:bg-gray-900/60"
          style={{ height: TOOLBAR_HEIGHT }}
        >
          <span className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
            {CONFIG_FILENAME}
          </span>
          <span aria-hidden="true" className="flex gap-1">
            <span className="h-[22px] w-14 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
            <span className="h-[22px] w-14 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
          </span>
        </div>
        <div
          aria-hidden="true"
          data-on-dark
          className="flex flex-col bg-[#1a1a1a] px-6 pb-6 pt-4"
          style={{ height: PREVIEW_HEIGHT }}
        >
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-[#e5e5e5]">myapp</span>
            <span className="flex gap-2">
              {[16, 16, 12, 20].map((w, i) => (
                <span
                  key={i}
                  className="h-7 rounded-md bg-[#2e2e2e] motion-safe:animate-pulse"
                  style={{ width: `${w * 4}px` }}
                />
              ))}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[13px] text-[#919191]">Loading preview…</span>
          </div>
        </div>
        <div
          className="relative border-t border-gray-200 dark:border-gray-800"
          style={{ height: EDITOR_HEIGHT }}
        >
          <ConfigYaml
            source={CONFIG_EXAMPLE}
            className="absolute inset-0 overflow-y-auto"
          />
        </div>
      </div>
    </div>
  );
}
