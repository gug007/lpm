"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  FolderOpen,
  MousePointer2,
  Terminal,
} from "lucide-react";
import { FOCUS_RING, PRESS } from "./ui";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

type OpenInApp = {
  id: string;
  label: string;
  icon: IconType;
};

const GROUPS: { label: string | null; items: OpenInApp[] }[] = [
  {
    label: "Editors",
    items: [
      { id: "vscode", label: "VS Code", icon: Code2 },
      { id: "cursor", label: "Cursor", icon: MousePointer2 },
    ],
  },
  { label: "Terminals", items: [{ id: "terminal", label: "Terminal", icon: Terminal }] },
  { label: null, items: [{ id: "finder", label: "Finder", icon: FolderOpen }] },
];

const APPS = GROUPS.flatMap((g) => g.items);

export function OpenInDropdown() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(APPS[0]);
  const ref = useRef<HTMLDivElement | null>(null);
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <div className="inline-flex h-8 items-stretch rounded-lg border border-[#2e2e2e] bg-[#242424]">
        <button
          type="button"
          title={`Open in ${current.label}`}
          aria-label={`Open in ${current.label}`}
          className={`flex items-center rounded-l-lg px-2 text-[#b3b3b3] hover:bg-white/10 hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
        >
          <CurrentIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Choose app"
          aria-label="Choose app"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex items-center rounded-r-lg border-l border-[#2e2e2e] px-1.5 hover:bg-white/10 hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING} ${
            open ? "bg-[#333333] text-[#e5e5e5]" : "text-[#b3b3b3]"
          }`}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            strokeWidth={1.75}
          />
        </button>
      </div>
      {open && (
        <div
          role="menu"
          className="switcher-in absolute right-0 top-full z-40 mt-1.5 w-52 origin-top-right rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] p-1 shadow-xl"
        >
          {GROUPS.map((group, gi) => (
            <div key={group.label ?? "other"}>
              {group.label ? (
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-[#919191]">
                  {group.label}
                </div>
              ) : (
                gi > 0 && <div className="mx-2 my-1 h-px bg-[#2e2e2e]" />
              )}
              {group.items.map((app) => {
                const Icon = app.icon;
                const active = app.id === current.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCurrent(app);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-75 hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${
                      active ? "text-[#e5e5e5]" : "text-[#b3b3b3]"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#919191]" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{app.label}</span>
                    {active && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#919191]" strokeWidth={2.25} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
