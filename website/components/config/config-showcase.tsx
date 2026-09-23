"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { useInView } from "@/components/config/playground/hooks";
import {
  CONFIG_EXAMPLE,
  CONFIG_FILENAME,
} from "@/components/config/config-showcase-data";
import { ConfigPlaceholder } from "@/components/config/config-showcase-placeholder";
import { ConfigYaml } from "@/components/config/config-showcase-yaml";

const ConfigPlayground = dynamic(
  () => import("@/components/config/playground").then((m) => m.ConfigPlayground),
  { ssr: false, loading: () => <ConfigPlaceholder /> },
);

const DESKTOP = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// The live editor pulls about a megabyte from a CDN and wants a keyboard, so
// phones get a static copy of the example and larger screens load the editor
// only as the section nears the viewport.
export function ConfigShowcase() {
  const isDesktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  const { ref, inView } = useInView<HTMLDivElement>("800px 0px");

  return (
    <div ref={ref}>
      <figure className="replica-ui mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white md:hidden dark:border-gray-800 dark:bg-gray-950">
        <figcaption className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 font-mono text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
          {CONFIG_FILENAME}
        </figcaption>
        <ConfigYaml source={CONFIG_EXAMPLE} />
      </figure>
      <div className="hidden md:block">
        {isDesktop && inView ? (
          <ConfigPlayground filename={CONFIG_FILENAME} initial={CONFIG_EXAMPLE} />
        ) : (
          <ConfigPlaceholder />
        )}
      </div>
    </div>
  );
}
