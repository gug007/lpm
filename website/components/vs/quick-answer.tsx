import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  question: string;
  children: ReactNode;
};

export function QuickAnswer({
  eyebrow = "The short answer",
  question,
  children,
}: Props) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.025]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {question}
          </h2>
          <div className="mt-4 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
