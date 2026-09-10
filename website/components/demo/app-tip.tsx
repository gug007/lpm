"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import { useReducedMotion } from "./ui";

type TipPart = { text: string } | { key: string };

const TIPS: TipPart[][] = [
  [{ text: "Right-click a tab to rename or pin it" }],
  [{ text: "The + arrow opens a diff or a browser" }],
  [{ text: "Split a pane sideways or stacked" }],
  [{ text: "Drag the divider to resize the panes" }],
  [{ text: "Click a service tab to watch its log" }],
  [{ text: "In the app," }, { key: "⌘T" }, { text: "opens a terminal" }],
  [{ text: "In the app," }, { key: "@" }, { text: "mentions files" }],
];

const ROTATE_MS = 9000;

const MODIFIERS = new Set(["⌘", "⇧", "⌥", "⌃"]);

// Each modifier glyph gets its own cap; the rest of the combo is one key, so
// "⌘T" reads as ⌘ + T the way the app renders it.
function splitKeys(label: string): string[] {
  const keys: string[] = [];
  let buf = "";
  for (const ch of label) {
    if (!MODIFIERS.has(ch)) {
      buf += ch;
      continue;
    }
    if (buf) {
      keys.push(buf);
      buf = "";
    }
    keys.push(ch);
  }
  if (buf) keys.push(buf);
  return keys;
}

export function AppTip() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fits, setFits] = useState(true);
  const slotRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % TIPS.length),
      ROTATE_MS,
    );
    return () => window.clearTimeout(id);
  }, [reducedMotion, paused, index]);

  // The footer hands the tip whatever is left after the git cluster, and every
  // project leaves a different amount. So show a tip only while it fits whole,
  // the way the app does, rather than shredding it to an ellipsis: a longer one
  // simply sits the round out until a shorter one rotates in or the pane grows.
  // The slot keeps its flex-1 either way, which is what holds the git cluster
  // against the right edge.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const content = contentRef.current;
    if (!slot || !content) return;
    const measure = () => setFits(content.offsetWidth <= slot.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [index]);

  return (
    <div ref={slotRef} className="min-w-0 flex-1 overflow-hidden">
      <div
        ref={contentRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className={`flex h-6 w-fit select-none items-center gap-2 transition-opacity duration-200 ${
          fits ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]" strokeWidth={1.75} />
        <span className="flex items-center gap-1 whitespace-nowrap text-[12px] text-[#8e8e8e]">
          {TIPS[index].map((part, i) =>
            "key" in part ? (
              <Combo key={i} label={part.key} />
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
      </div>
    </div>
  );
}

function Combo({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {splitKeys(label).map((key, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-[9px] text-[#8e8e8e]">+</span>}
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[#333333] px-1.5 text-[11px] font-medium leading-none text-[#b3b3b3]">
            {key}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
