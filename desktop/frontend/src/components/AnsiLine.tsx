import { useMemo } from "react";
import { ansiColors } from "./terminal-utils";

// ANSI SGR renderer for the status line preview. It renders with the SAME palette
// lpm's built-in terminal (xterm) uses — `ansiColors` from terminal-utils — so
// the preview matches Claude Code running in the real terminal. Supports reset(0),
// bold(1), dim(2), italic(3), underline(4), the 8/16 foreground colors
// (30–37 / 90–97), 256-color foreground (38;5;n / 38;2;r;g;b), and default fg(39).
// Unknown codes are ignored so unusual output still renders as plain text.

interface RunStyle {
  color?: string;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

interface Run {
  text: string;
  style: RunStyle;
}

// The 16 base colors, in ANSI index order, straight from the terminal's palette.
const ANSI16: string[] = [
  ansiColors.black,
  ansiColors.red,
  ansiColors.green,
  ansiColors.yellow,
  ansiColors.blue,
  ansiColors.magenta,
  ansiColors.cyan,
  ansiColors.white,
  ansiColors.brightBlack,
  ansiColors.brightRed,
  ansiColors.brightGreen,
  ansiColors.brightYellow,
  ansiColors.brightBlue,
  ansiColors.brightMagenta,
  ansiColors.brightCyan,
  ansiColors.brightWhite,
];

// xterm.js dims by halving the color's alpha (DIM_OPACITY = 0.5).
const DIM_OPACITY = 0.5;

const CUBE = [0, 95, 135, 175, 215, 255];

function ansi256(n: number): string | undefined {
  if (n < 16) return ANSI16[n];
  if (n < 232) {
    const i = n - 16;
    const r = CUBE[Math.floor(i / 36) % 6];
    const g = CUBE[Math.floor(i / 6) % 6];
    const b = CUBE[i % 6];
    return `rgb(${r}, ${g}, ${b})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v}, ${v}, ${v})`;
}

function fresh(): RunStyle {
  return { bold: false, dim: false, italic: false, underline: false };
}

function applyCodes(style: RunStyle, codes: number[]): void {
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) Object.assign(style, fresh());
    else if (c === 1) style.bold = true;
    else if (c === 2) style.dim = true;
    else if (c === 3) style.italic = true;
    else if (c === 4) style.underline = true;
    else if (c === 22) style.bold = style.dim = false;
    else if (c === 23) style.italic = false;
    else if (c === 24) style.underline = false;
    else if (c === 39) style.color = undefined;
    else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) {
      style.color = ANSI16[c >= 90 ? c - 90 + 8 : c - 30];
    } else if (c === 38 && codes[i + 1] === 5) {
      style.color = ansi256(codes[i + 2] ?? 0);
      i += 2;
    } else if (c === 38 && codes[i + 1] === 2) {
      style.color = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`;
      i += 4;
    }
    // Unknown codes (backgrounds, etc.) are ignored.
  }
}

function parseAnsi(input: string): Run[] {
  const runs: Run[] = [];
  const style = fresh();
  let i = 0;
  const push = (text: string) => {
    if (text) runs.push({ text, style: { ...style } });
  };
  while (i < input.length) {
    const esc = input.indexOf("\x1b[", i);
    if (esc === -1) {
      push(input.slice(i));
      break;
    }
    push(input.slice(i, esc));
    const end = input.indexOf("m", esc);
    if (end === -1) break; // malformed trailing sequence
    const codes = input
      .slice(esc + 2, end)
      .split(";")
      .map((s) => (s === "" ? 0 : parseInt(s, 10)));
    applyCodes(style, codes);
    i = end + 1;
  }
  return runs;
}

export function AnsiLine({ text }: { text: string }) {
  const runs = useMemo(() => parseAnsi(text), [text]);
  return (
    <>
      {runs.map((run, idx) => (
        <span
          key={idx}
          style={{
            color: run.style.color,
            fontWeight: run.style.bold ? 600 : undefined,
            fontStyle: run.style.italic ? "italic" : undefined,
            textDecoration: run.style.underline ? "underline" : undefined,
            opacity: run.style.dim ? DIM_OPACITY : undefined,
          }}
        >
          {run.text}
        </span>
      ))}
    </>
  );
}
