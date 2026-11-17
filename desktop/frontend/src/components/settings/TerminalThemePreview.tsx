import { useLayoutEffect, useRef, useState } from "react";
import {
  getTerminalThemeColors,
  terminalAnsiColors,
  terminalThemeLabel,
  type TerminalThemeName,
} from "../../terminal-themes";
import { TrafficLights } from "../ui/TrafficLights";

export function TerminalThemePreview({
  theme,
  fontSize,
  fontFamily,
  lineHeight = 1,
}: {
  theme: TerminalThemeName;
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
}) {
  const colors = getTerminalThemeColors(theme);
  const bg = colors?.bg ?? "var(--terminal-bg)";
  const fg = colors?.fg ?? "var(--terminal-fg)";
  const header = colors?.header ?? "var(--terminal-header)";
  const headerText = colors?.headerText ?? "var(--terminal-header-text)";
  const cursor = colors?.cursor ?? fg;
  const ansi = terminalAnsiColors(colors);

  // xterm makes a row the font's natural line height times the setting, which
  // CSS's unitless line-height would draw tighter than the real terminal.
  const probeRef = useRef<HTMLSpanElement>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const natural = probeRef.current?.getBoundingClientRect().height;
    setRowHeight(natural ? Math.floor(Math.ceil(natural) * lineHeight) : null);
  }, [fontSize, fontFamily, lineHeight]);

  return (
    <div
      className="w-full overflow-hidden rounded-md border border-[var(--border)] font-mono shadow-sm"
      style={{ background: bg, color: fg, fontFamily }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5"
        style={{ background: header, color: headerText }}
      >
        <TrafficLights />
        <span className="ml-1 truncate font-sans text-[11px] font-medium leading-none">{terminalThemeLabel(theme)}</span>
      </div>
      <div
        className="relative whitespace-pre px-3 py-2 [&>div]:overflow-hidden [&>div]:text-ellipsis"
        style={{ fontSize: `${fontSize}px`, lineHeight: rowHeight ? `${rowHeight}px` : lineHeight }}
      >
        <span
          ref={probeRef}
          aria-hidden
          className="pointer-events-none invisible absolute"
          style={{ lineHeight: "normal" }}
        >
          W
        </span>
        <div>
          <span style={{ color: ansi.blue }}>$</span> npm run dev
        </div>
        <div style={{ opacity: 0.7 }}>
          {"  Local:   "}
          <span className="underline underline-offset-2" style={{ color: ansi.blue }}>
            http://localhost:3000
          </span>
        </div>
        <div style={{ color: ansi.green }}>✓ Ready in 842ms</div>
        <div className="flex items-center">
          <span>$&nbsp;</span>
          <span
            className="demo-cursor inline-block"
            style={{ width: "0.6em", height: rowHeight ? `${rowHeight}px` : "1em", background: cursor }}
          />
        </div>
      </div>
    </div>
  );
}
