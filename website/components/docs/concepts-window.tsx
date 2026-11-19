import Image from "next/image";
import { CONCEPTS } from "./concepts-data";

export function ConceptsWindow() {
  return (
    <figure className="mb-8">
      <div className="relative overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10 dark:ring-white/10">
        <Image
          src="/docs/lpm-window.jpg"
          alt="The lpm window. The sidebar lists five projects; saas-app is running two services and a Claude Code session, and two other projects show an agent that finished and one that is waiting."
          width={2000}
          height={1280}
          sizes="(min-width: 1024px) 768px, 100vw"
          loading="eager"
          fetchPriority="high"
          className="block h-auto w-full"
        />
        {CONCEPTS.map(
          ({ id, pin }, i) =>
            pin && (
              <span
                key={id}
                aria-hidden="true"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                className="absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[9px] font-bold tabular-nums text-gray-900 shadow-md ring-2 ring-gray-900/60 sm:h-[22px] sm:w-[22px] sm:text-xs"
              >
                {i + 1}
              </span>
            ),
        )}
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        One project running, with an agent at work. The numbers match the
        list below.
      </figcaption>
    </figure>
  );
}
