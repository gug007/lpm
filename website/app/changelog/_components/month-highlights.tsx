import Image from "next/image";
import Link from "next/link";
import type { MonthHighlight } from "@/lib/changelog-highlights";
import { formatReleaseDate } from "@/lib/downloads";

export function MonthHighlights({ items }: { items: MonthHighlight[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Biggest changes
      </h3>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.version} className="flex">
            <Link
              href={item.href}
              className="group flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700"
            >
              {item.lesson ? (
                <span className="relative block aspect-video bg-[#ebe5d9]">
                  <Image
                    src={item.lesson.thumbnail}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 180px, 50vw"
                    className="object-cover"
                  />
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-gray-900/85 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-2.5 w-2.5 fill-current"
                    >
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
                    <span className="sr-only">Lesson, </span>
                    {item.lesson.length}
                  </span>
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex aspect-video items-center justify-center bg-gray-100 px-3 text-center text-balance text-sm font-bold leading-tight tracking-tight text-gray-900 dark:bg-white/[0.06] dark:text-gray-100"
                >
                  {item.cover}
                </span>
              )}
              <span className="flex flex-1 flex-col gap-1 p-3">
                <span className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                  {formatReleaseDate(item.date)} · v{item.version}
                </span>
                <span className="text-pretty text-[13px] font-semibold leading-snug text-gray-900 underline-offset-4 decoration-gray-300 group-hover:underline dark:text-gray-100 dark:decoration-gray-600">
                  {item.title}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
