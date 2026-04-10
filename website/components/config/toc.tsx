"use client";

import { useEffect, useState } from "react";
import { CONFIG_SECTIONS } from "@/lib/config-sections";

export function TableOfContents() {
  const [activeId, setActiveId] = useState<string>(CONFIG_SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const { id } of CONFIG_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Table of contents" className="text-xs">
      <p className="mb-3 text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-gray-200 dark:border-gray-800">
        {CONFIG_SECTIONS.map(({ id, title }) => {
          const isActive = id === activeId;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`block -ml-px border-l pl-3 py-0.5 transition-colors ${
                  isActive
                    ? "border-gray-900 dark:border-white text-gray-900 dark:text-white font-medium"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
