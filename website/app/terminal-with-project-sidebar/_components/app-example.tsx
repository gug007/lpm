import { ShowcaseWindow } from "./showcase-window";

export default function AppExample() {
  return (
    <section
      aria-labelledby="app-example-heading"
      className="overflow-hidden pb-16 sm:pb-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-4 flex flex-col items-center gap-2 text-center lg:mb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:text-left">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
            <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold tracking-widest text-gray-600 uppercase dark:bg-gray-800/60 dark:text-gray-300">
              The window
            </span>
            <h2
              id="app-example-heading"
              className="text-balance text-lg font-bold tracking-tight sm:text-xl"
            >
              This is lpm, sidebar open
            </h2>
          </div>
          <p className="max-w-md text-pretty text-[13px] leading-relaxed text-gray-500 lg:max-w-sm lg:text-right dark:text-gray-400">
            Project rows stay on the left; the selected project&apos;s terminals
            and agent sessions fill the workspace on the right. Click another
            row and that whole workspace swaps.
          </p>
        </div>

        <figure className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_20%,rgba(74,222,128,0.18),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(99,102,241,0.16),transparent_36%)] blur-2xl" />
          <ShowcaseWindow />
          <figcaption className="mx-auto mt-5 max-w-2xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Not a screenshot: the lpm window drawn in the page itself, with the
            app&apos;s own layout and colours. The green outline and its label
            are added here. checkout is the selected row, so the workspace holds
            its three terminals and the Claude Code session running in one of
            them — and while you sit there, auth-hotfix has gone amber further
            down the list, because the agent in that project is waiting on an
            answer.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
