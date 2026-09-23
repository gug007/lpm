"use client";

import { useEffect, useRef, useState } from "react";
import { AREAS, REQUIREMENTS_AREA } from "./areas";

const ITEMS = [...AREAS, REQUIREMENTS_AREA];

export default function JumpNav() {
  const [active, setActive] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive(ITEMS.find((item) => visible.has(item.id))?.id ?? null);
      },
      { rootMargin: "-150px 0px -50% 0px" },
    );
    for (const item of ITEMS) {
      const section = document.getElementById(item.id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const chip = active
      ? scroller?.querySelector<HTMLElement>(`[data-area="${active}"]`)
      : null;
    if (!scroller || !chip) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({
      left: chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <nav
      aria-label="Feature areas"
      className="sticky top-14 z-40 border-y border-gray-200/70 bg-white/85 backdrop-blur-lg dark:border-gray-800/70 dark:bg-[#111]/85"
    >
      <div
        ref={scrollerRef}
        className="relative overflow-x-auto scrollbar-none [mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%_-_28px),transparent)]"
      >
        <ul className="mx-auto flex w-max gap-1 px-4 py-1.5 sm:px-6">
          {ITEMS.map(({ id, label, icon: Icon }) => {
            const current = id === active;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  data-area={id}
                  aria-current={current ? "location" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors duration-200 ${
                    current
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
