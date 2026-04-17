import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";

type Column = {
  name: string;
  headline: string;
  points: string[];
};

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  lpm: Column;
  competitor: Column;
};

export function WhenToPick({
  eyebrow = "Honest take",
  title,
  description,
  lpm,
  competitor,
}: Props) {
  const columns = [
    { ...lpm, highlight: true },
    { ...competitor, highlight: false },
  ];

  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          {columns.map((col) => (
            <div
              key={col.name}
              className={`rounded-2xl border p-6 sm:p-7 ${
                col.highlight
                  ? "border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-white/[0.04]"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <div
                className={`text-xs font-semibold uppercase tracking-widest mb-2 ${
                  col.highlight
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                Pick {col.name}
              </div>
              <h3
                className={`text-lg font-semibold mb-4 leading-snug ${
                  col.highlight
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {col.headline}
              </h3>
              <ul className="space-y-2.5">
                {col.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                  >
                    <span className="mt-2 w-1 h-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
