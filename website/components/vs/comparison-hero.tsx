import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";
import { VS_BASE_PATH } from "@/lib/links";

type Props = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
};

export function ComparisonHero({ eyebrow, title, description }: Props) {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="max-w-4xl mx-auto px-6">
        <div className="mb-5">
          <Link
            href={VS_BASE_PATH}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          >
            <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />
            All comparisons
          </Link>
        </div>
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/60 px-3 py-1 rounded-full mb-5">
          {eyebrow}
        </span>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          {description}
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload />
        </div>

        <div className="mt-[clamp(1rem,2vh,1.5rem)]">
          <GithubLink
            source="vs-hero"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          />
        </div>
      </div>
    </section>
  );
}
