import Image from "next/image";

// Real lpm Link screens from Demo Mode, cropped to their top 1206×1720.
const SCREENS: { src: string; title: string; body: string; alt: string }[] = [
  {
    src: "/lpm-link/projects.jpg",
    title: "Every project",
    body: "Which agent is working, done or waiting on you.",
    alt: "lpm Link listing a Mac's projects, with a Claude Code session waiting and Codex running",
  },
  {
    src: "/lpm-link/agent.jpg",
    title: "Answer an agent",
    body: "A push opens the session. Reply, then pick it up at your desk.",
    alt: "A Claude Code session in lpm Link, waiting for a reply, with the composer at the bottom",
  },
  {
    src: "/lpm-link/diff.jpg",
    title: "Git review",
    body: "Read the diff, commit with an AI-written message, open a PR.",
    alt: "The Changes screen in lpm Link showing a diff of four changed files",
  },
  {
    src: "/lpm-link/automation.jpg",
    title: "Automations",
    body: "Run, pause or edit scheduled tasks and read every run.",
    alt: "An automation in lpm Link with its schedule and run history",
  },
  {
    src: "/lpm-link/usage.jpg",
    title: "Usage limits",
    body: "Claude and Codex 5‑hour and weekly windows, and your pace.",
    alt: "The Usage screen in lpm Link with weekly and 5-hour meters for two Claude accounts",
  },
];

export function DevicesCapabilities() {
  return (
    <div>
      <h3 className="text-center text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Also in the iPhone app
      </h3>
      {/* A row that scrolls sideways until all five fit side by side. */}
      <ul
        tabIndex={0}
        aria-label="Also in the iPhone app"
        className="scrollbar-none -mx-4 mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:mt-7 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0"
      >
        {SCREENS.map(({ src, title, body, alt }) => (
          <li
            key={src}
            className="flex w-[9.5rem] shrink-0 snap-center flex-col items-center gap-3.5 text-center lg:w-auto"
          >
            <div className="w-[9.5rem] rounded-[1.6rem] bg-[#111] p-1 shadow-[0_18px_40px_-18px_rgba(17,24,39,0.45)] ring-1 ring-black/10 dark:shadow-black/60 dark:ring-white/10 lg:w-[10.25rem]">
              <Image
                src={src}
                alt={alt}
                width={360}
                height={514}
                sizes="164px"
                className="h-auto w-full rounded-[1.35rem]"
              />
            </div>
            <span className="block max-w-[12.5rem]">
              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-gray-600 dark:text-gray-400">
                {body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
