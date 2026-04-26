"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AI_AGENTS_PATH, VS_BASE_PATH } from "@/lib/links";

const linkClass =
  "text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors duration-200";

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
        className="md:hidden text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer transition-colors duration-200"
      >
        {open ? (
          <X className="w-[18px] h-[18px]" />
        ) : (
          <Menu className="w-[18px] h-[18px]" />
        )}
      </button>
      {open && (
        <div className="md:hidden absolute top-14 left-0 right-0 border-t border-gray-100 dark:border-gray-800/60 bg-white/70 dark:bg-[#111]/70 backdrop-blur-lg px-4 py-4 flex flex-col gap-4">
          <Link href={AI_AGENTS_PATH} onClick={close} className={linkClass}>
            For AI agents
          </Link>
          <Link href={VS_BASE_PATH} onClick={close} className={linkClass}>
            Compare
          </Link>
        </div>
      )}
    </>
  );
}
