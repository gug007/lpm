"use client";

import { useEffect, useState } from "react";
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

export function AppTip() {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % TIPS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-[#919191]">
      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-[#f59e0b]" strokeWidth={1.75} />
      <span className="flex min-w-0 items-center gap-1 truncate">
        {TIPS[index].map((part, i) =>
          "key" in part ? (
            <kbd
              key={i}
              className="rounded border border-[#2e2e2e] bg-[#242424] px-1 py-px font-mono text-[10px] text-[#b3b3b3]"
            >
              {part.key}
            </kbd>
          ) : (
            <span key={i} className="truncate">
              {part.text}
            </span>
          ),
        )}
      </span>
    </div>
  );
}
