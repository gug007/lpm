"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/links";

function toggle() {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
  } catch {}
}

export function ThemeToggle() {
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer transition-colors duration-200"
    >
      <Sun className="hidden dark:block w-[15px] h-[15px]" />
      <Moon className="block dark:hidden w-[15px] h-[15px]" />
    </button>
  );
}
