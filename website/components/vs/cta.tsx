import type { ReactNode } from "react";
import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

type Props = {
  title: ReactNode;
  description: ReactNode;
};

export function Cta({ title, description }: Props) {
  return (
    <section className="py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          {title}
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          {description}
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>

        <div className="mt-8">
          <GithubLink
            source="vs-cta"
            className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          />
        </div>
      </div>
    </section>
  );
}
