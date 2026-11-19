import Link from "next/link";
import { Section } from "@/components/config/section";
import { LINK, P } from "@/components/prose";
import { DEMO_PATH } from "@/lib/links";
import { CONCEPTS } from "./concepts-data";
import { ConceptsWindow } from "./concepts-window";

export function ConceptsGuide() {
  return (
    <Section
      title="How lpm is organized"
      description="Eight words cover almost everything in the window. Learn these, and the rest of the docs read faster."
    >
      <ConceptsWindow />
      <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {CONCEPTS.map(({ id, term, body, href }, i) => (
          <li key={id} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold tabular-nums text-white dark:bg-white dark:text-gray-900"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <h2
                id={id}
                className="scroll-mt-24 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white"
              >
                <Link
                  href={href}
                  className="underline-offset-4 hover:underline"
                >
                  {term}
                </Link>
              </h2>
              <p className={`mt-1 ${P}`}>{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className={`mt-10 ${P}`}>
        To click around this same window without installing anything,{" "}
        <Link href={DEMO_PATH} className={LINK}>
          open the demo in your browser
        </Link>
        .
      </p>
    </Section>
  );
}
