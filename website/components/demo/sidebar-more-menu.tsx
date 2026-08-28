"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  History,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Smartphone,
  Zap,
} from "lucide-react";
import { TELEGRAM_URL } from "@/lib/links";
import { FOCUS_RING, PRESS } from "./ui";
import type { DemoView } from "./views";

type MoreMenuProps = {
  activeView: DemoView;
  onOpen: (view: DemoView) => void;
  hasError: boolean;
  unreadAutomations: number;
  runningAutomations: number;
};

const MENU_VIEWS: DemoView[] = [
  "activity",
  "automations",
  "usage",
  "stats",
  "mobile",
  "settings",
];

export function SidebarMoreMenu({
  activeView,
  onOpen,
  hasError,
  unreadAutomations,
  runningAutomations,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  const pick = (view: DemoView) => () => {
    setOpen(false);
    onOpen(view);
  };

  const inMenu = MENU_VIEWS.includes(activeView);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${PRESS} ${FOCUS_RING} ${
          open || inMenu
            ? "bg-[#333333] text-[#e5e5e5]"
            : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
        }`}
      >
        <span className="shrink-0">
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
        </span>
        <span className="truncate">More</span>
        <span className="ml-auto flex items-center gap-2">
          <ErrorSignal hasError={hasError} />
          {runningAutomations > 0 ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee]" />
          ) : (
            <CountBadge count={unreadAutomations} label="unread automations" />
          )}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="menu-pop absolute bottom-full left-0 z-40 mb-1.5 w-full min-w-[12rem] rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] px-1 py-1 shadow-lg"
        >
          <MenuRow
            icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Activity"
            active={activeView === "activity"}
            onClick={pick("activity")}
            trailing={<ErrorSignal hasError={hasError} />}
          />
          <MenuRow
            icon={<History className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Automations"
            active={activeView === "automations"}
            onClick={pick("automations")}
            trailing={
              runningAutomations > 0 ? (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-[#22d3ee]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22d3ee]" />
                  Running
                </span>
              ) : (
                <CountBadge count={unreadAutomations} label="unread automations" />
              )
            }
          />
          <MenuRow
            icon={<Zap className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Usage"
            active={activeView === "usage"}
            onClick={pick("usage")}
          />
          <MenuRow
            icon={<BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Stats"
            active={activeView === "stats"}
            onClick={pick("stats")}
          />
          <MenuRow
            icon={<Smartphone className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Mobile app"
            active={activeView === "mobile"}
            onClick={pick("mobile")}
          />
          <div className="my-1 h-px bg-[#2e2e2e]" />
          <MenuRow
            icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Settings"
            active={activeView === "settings"}
            onClick={pick("settings")}
          />
          <a
            role="menuitem"
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING}`}
          >
            <span className="shrink-0">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
            </span>
            <span className="truncate">Support &amp; Feedback</span>
          </a>
        </div>
      )}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  active,
  onClick,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${FOCUS_RING} ${
        active
          ? "bg-[#333333] text-[#e5e5e5]"
          : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      {trailing && <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">{trailing}</span>}
    </button>
  );
}

// The ambient signal the app's footer carries: an agent somewhere hit an error.
function ErrorSignal({ hasError }: { hasError: boolean }) {
  if (!hasError) return null;
  return <span aria-label="an agent hit an error" className="h-1.5 w-1.5 rounded-full bg-[#f87171]" />;
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${label}`}
      className="inline-flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full bg-[#60a5fa] px-1 text-[10px] font-semibold leading-none tabular-nums text-[#1a1a1a]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
