"use client";

import { Fragment, useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { useReducedMotion } from "./ui";

type TipPart = { text: string } | { key: string };

const TIPS: TipPart[][] = [
  [{ text: "Right-click a tab to rename or pin it" }],
  [{ text: "The arrow next to + opens a diff tab or a browser" }],
  [{ text: "Split a pane sideways or stacked from the buttons on the right" }],
  [{ text: "Drag the divider between panes to resize them" }],
  [{ text: "Click a service tab to watch its log stream" }],
  [{ text: "In the app, " }, { key: "⌘T" }, { text: " opens a fresh terminal tab" }],
  [{ text: "In the app, " }, { key: "@" }, { text: " mentions files, branches, changes, or terminals" }],
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
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % TIPS.length),
      ROTATE_MS,
    );
    return () => window.clearTimeout(id);
  }, [reducedMotion, paused, index]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="flex h-6 min-w-0 flex-1 select-none items-center gap-2"
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]" strokeWidth={1.75} />
      <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-[#8e8e8e]">
        {TIPS[index].map((part, i) =>
          "key" in part ? (
            <Combo key={i} label={part.key} />
          ) : (
            // Only the last part gives way: letting every span shrink
            // ellipsises the lead-in too, so the tip reads "In the … @ mentions
            // files, …" with both halves cut.
            <span
              key={i}
              className={
                i === TIPS[index].length - 1
                  ? "truncate"
                  : "shrink-0 whitespace-pre"
              }
            >
              {part.text}
            </span>
          ),
        )}
      </span>
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
