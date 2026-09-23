"use client";

import { useEffect, useState } from "react";
import { CONFIG_SECTIONS } from "@/lib/config-sections";

const ACTIVE_LINE_PX = 120;

export function TableOfContents() {
  const [activeId, setActiveId] = useState<string>(CONFIG_SECTIONS[0].id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = CONFIG_SECTIONS[0].id;
      for (const { id } of CONFIG_SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_LINE_PX) current = id;
      }
      setActiveId(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <nav aria-label="Table of contents" className="text-xs">
      <p className="mb-3 text-[10px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
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
