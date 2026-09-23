import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { BEST_TERMINAL_MAC_PATH } from "@/lib/links";

type Shelf = {
  name: string;
  body: string;
  wide?: boolean;
};

const SHELF: Shelf[] = [
  {
    name: "iTerm2",
    body: "free under GPLv2, scriptable from Python, and still moving: 3.7 added a Claude Code integration, groups of tabs and a companion iOS app in September 2026.",
  },
  {
    name: "Warp",
    body: "the AI-first one, and open source now: its client is AGPL v3, apart from the UI crates it ships under MIT.",
  },
  {
    name: "Ghostty, Kitty, WezTerm, Alacritty",
    body: "four more names worth trying. This page argues with none of them, and does not rank them — lpm is not competing for the slot they are in, so it has no business grading them either.",
    wide: true,
  },
];

export function EmulatorShelf() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="Be honest"
          title="If what you want is a better emulator, here is the shelf"
          description="lpm is not competing for this slot. Pick whichever one you like: lpm runs beside it in a window of its own, and hands you straight back to it whenever you want a shell."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {SHELF.map((item) => (
            <article
              key={item.name}
              className={`rounded-2xl border border-gray-200 p-6 transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700${
                item.wide ? " sm:col-span-2" : ""
              }`}
            >
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                <strong className="font-semibold text-gray-900 dark:text-gray-100">
                  {item.name}
                </strong>{" "}
                — {item.body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/50 p-6 dark:border-gray-800 dark:bg-white/[0.02]">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            None of them start your services, none of them know what a project
            is, and none of them keep your dev servers up after you quit. That is
            the gap lpm fills — whichever of these you keep open.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            lpm does ship a terminal of its own, because the panes have to live
            somewhere.{" "}
            <Link
              href={BEST_TERMINAL_MAC_PATH}
              className="font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
            >
              What it includes is listed here
            </Link>{" "}
            — it is a shell in a tab, not an entry on the shelf above.
          </p>
        </div>
      </div>
    </section>
  );
}
