import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type RelatedLink = {
  href: string;
  title: string;
  description: string;
};

export function RelatedPages({ links }: { links: RelatedLink[] }) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-6">
          Keep reading
        </h2>
        <div
          className={`grid gap-4 sm:grid-cols-2 ${
            links.length % 3 === 0 ? "lg:grid-cols-3" : ""
          }`}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-none hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-all duration-200"
            >
              <h3 className="text-sm font-semibold mb-1.5 inline-flex items-center gap-1.5 text-gray-900 dark:text-gray-100">
                {link.title}
                <ArrowRight
                  className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0 transition-all duration-200"
                  aria-hidden
                />
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {link.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
