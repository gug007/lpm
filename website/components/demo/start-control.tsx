"use client";

import { useEffect, useRef, type Ref } from "react";
import { ChevronDown } from "lucide-react";
import type { DemoProject } from "./projects";
import { StartMenu } from "./start-menu";
import { FOCUS_RING, PRESS } from "./ui";

type StartControlProps = {
  project: DemoProject;
  running: boolean;
  runningServices: Set<string>;
  open: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onStartStop: () => void;
  onStartProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  // The opening tour mimes a click on Start, and rings it beforehand so the
  // visitor's eye is already there when the cursor arrives.
  startButtonRef?: Ref<HTMLButtonElement>;
  ringPulse?: boolean;
};

export function StartControl({
  project,
  running,
  runningServices,
  open,
  onToggleMenu,
  onCloseMenu,
  onStartStop,
  onStartProfile,
  onToggleService,
  startButtonRef,
  ringPulse,
}: StartControlProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onCloseMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCloseMenu]);

  const hasServices = project.services.length > 0;
  const segmentHover = running ? "hover:bg-black/10" : "hover:bg-[#1a1a1a]/15";
  const chevronOpen = running ? "bg-black/10" : "bg-[#1a1a1a]/15";

  return (
    <div ref={ref} className="relative flex shrink-0">
      {hasServices ? (
        <div
          className={`inline-flex h-8 items-stretch rounded-lg border ${
            running
              ? "border-[#f87171] bg-[#f87171] text-white"
              : "border-[#e5e5e5] bg-[#e5e5e5] text-[#1a1a1a]"
          }`}
        >
          <button
            ref={startButtonRef}
            type="button"
            onClick={onStartStop}
            aria-label={running ? "Stop services" : "Start services"}
            className={`flex items-center rounded-l-lg px-3.5 text-xs font-medium ${segmentHover} ${PRESS} ${FOCUS_RING} ${
              ringPulse && !running ? "start-ring-pulse" : ""
            }`}
          >
            {running ? "Stop" : "Start"}
          </button>
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="Services and profiles"
            aria-expanded={open}
            aria-haspopup="menu"
            className={`flex items-center rounded-r-lg border-l px-1.5 ${
              running ? "border-white/20" : "border-[#1a1a1a]/20"
            } ${segmentHover} ${open ? chevronOpen : ""} ${PRESS} ${FOCUS_RING}`}
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label="Services and profiles"
          aria-expanded={open}
          aria-haspopup="menu"
          className={`flex h-8 items-center rounded-lg border border-[#2e2e2e] px-1.5 hover:bg-white/10 hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING} ${
            open ? "bg-[#333333] text-[#e5e5e5]" : "bg-[#242424] text-[#b3b3b3]"
          }`}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}
      {open && (
        <StartMenu
          profiles={project.profiles}
          services={project.services}
          runningServices={runningServices}
          onPickProfile={onStartProfile}
          onToggleService={onToggleService}
        />
      )}
    </div>
  );
}
