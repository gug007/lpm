import Image from "next/image";

const SCREENS = [
  {
    src: "/lpm-link/projects.jpg",
    alt: "lpm link listing a computer's projects, with a Claude Code session waiting and Codex running",
    tilt: "sm:-rotate-6 sm:translate-y-6",
  },
  {
    src: "/lpm-link/agent.jpg",
    alt: "A Claude Code session in lpm link, waiting for a reply, with the composer at the bottom",
    tilt: "z-10",
  },
  {
    src: "/lpm-link/diff.jpg",
    alt: "The Changes screen in lpm link showing a diff of four changed files",
    tilt: "sm:rotate-6 sm:translate-y-6",
  },
];

export default function PhoneScreens() {
  return (
    <ul className="flex items-start justify-center pb-2 sm:pb-12">
      {SCREENS.map(({ src, alt, tilt }, index) => (
        <li
          key={src}
          className={`relative max-w-[13rem] shrink-0 -mx-2 sm:-mx-3 ${tilt} ${
            index === 1 ? "w-[60%] min-[420px]:w-[34%]" : "hidden w-[34%] min-[420px]:block"
          }`}
        >
          <div className="rounded-[1.75rem] bg-[#111] p-1 shadow-[0_24px_50px_-20px_rgba(17,24,39,0.55)] ring-1 ring-black/10 dark:shadow-black/70 dark:ring-white/10">
            <Image
              src={src}
              alt={alt}
              width={360}
              height={514}
              sizes="208px"
              className="h-auto w-full rounded-[1.5rem]"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
