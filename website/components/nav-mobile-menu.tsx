"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AI_AGENTS_PATH, VS_BASE_PATH } from "@/lib/links";

const linkClass =
  "inline-flex w-fit items-center min-h-11 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200";

export function NavMobileMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="md:hidden -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer transition-colors duration-200"
      >
        {open ? (
          <X className="w-[18px] h-[18px]" />
        ) : (
          <Menu className="w-[18px] h-[18px]" />
        )}
      </button>
      {open && (
        <div className="md:hidden absolute top-14 left-0 right-0 border-t border-gray-200/70 dark:border-gray-800/70 bg-white/90 dark:bg-[#111]/90 backdrop-blur-lg px-6 py-2 flex flex-col">
          <Link href={AI_AGENTS_PATH} onClick={close} className={linkClass}>
            For AI agents
          </Link>
          <Link href={VS_BASE_PATH} onClick={close} className={linkClass}>
            Compare
          </Link>
          <Link
            href="/#download"
            onClick={close}
            className="my-3 inline-flex w-fit items-center rounded-full bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors duration-200"
          >
            Download
          </Link>
        </div>
      )}
    </>
  );
}
