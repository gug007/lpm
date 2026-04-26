import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { REPO_URL } from "@/lib/links";

type Props = {
  title: ReactNode;
  description: ReactNode;
};

export function Cta({ title, description }: Props) {
  return (
    <section className="py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
          {title}
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-xl mx-auto leading-relaxed tracking-wide">
          {description}
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>

        <div className="mt-8">
          <a
            href={REPO_URL}
            className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            View on GitHub
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
