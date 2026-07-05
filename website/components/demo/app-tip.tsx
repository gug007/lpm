"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";

type TipPart = { text: string } | { key: string };

const TIPS: TipPart[][] = [
  [{ text: "Press " }, { key: "⌘T" }, { text: " to open a fresh terminal tab" }],
  [{ text: "Split a pane with " }, { key: "⌘D" }, { text: " sideways or " }, { key: "⌘⇧D" }, { text: " stacked" }],
  [{ text: "Type " }, { key: "@" }, { text: " to mention files, branches, changes, or terminals" }],
  [{ text: "Right-click a tab and Pin it to block an accidental " }, { key: "⌘W" }],
  [{ text: "Drag a tab into another pane to rearrange your workspace" }],
  [{ text: "Search output with " }, { key: "⌘F" }],
  [{ text: "Press " }, { key: "⌘⇧R" }, { text: " to review changed files in a diff tab" }],
];

const ROTATE_MS = 9000;

export function AppTip() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % TIPS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, []);

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
