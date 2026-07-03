"use client";

import { useState, type ComponentType } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  FolderOpen,
  MousePointer2,
  Terminal,
} from "lucide-react";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

type OpenInApp = {
  id: string;
  label: string;
  icon: IconType;
};

const APPS: OpenInApp[] = [
  { id: "vscode", label: "VS Code", icon: Code2 },
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "finder", label: "Finder", icon: FolderOpen },
];

export function OpenInDropdown() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(APPS[0]);
  const CurrentIcon = current.icon;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Open in ${current.label}`}
        className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-2.5 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        <CurrentIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="hidden lg:inline">Open in {current.label}</span>
        <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
      </button>
      {open && (
        <div
          role="menu"
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 top-full z-40 mt-1.5 min-w-[200px] overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#242424] py-1 shadow-xl"
        >
          {APPS.map((app) => {
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
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#919191]" strokeWidth={1.75} />
                <span className="flex-1 truncate">{app.label}</span>
                {active && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#22d3ee]" strokeWidth={2.25} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
