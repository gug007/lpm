import type { PopupColor, PopupTheme } from "./popupTypes";

export const POPUP_FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;

// The app's colors a popup page gets as `lpm.theme` and `--lpm-*` variables,
// each read from the app's own variable so a page follows the theme.
const SOURCES: Record<PopupColor, string> = {
  bg: "--bg-secondary",
  surface: "--bg-primary",
  text: "--text-primary",
  muted: "--text-muted",
  border: "--border",
  accent: "--accent-blue",
  green: "--accent-green",
  red: "--accent-red",
  amber: "--accent-amber",
};

// A variable may be written as another variable or a color-mix, so each one is
// resolved through a probe to the rgb() the page can use as-is.
function resolve(probe: HTMLElement, variable: string): string {
  probe.style.color = `var(${variable})`;
  return getComputedStyle(probe).color;
}

function readTheme(mode: PopupTheme["mode"]): PopupTheme {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  try {
    const colors = Object.fromEntries(
      Object.entries(SOURCES).map(([name, variable]) => [name, resolve(probe, variable)]),
    ) as PopupTheme["colors"];
    return { mode, colors };
  } finally {
    probe.remove();
  }
}

const themes = new Map<PopupTheme["mode"], PopupTheme>();

// The colors only change with the mode, and every labelSvg button asks.
export function popupTheme(): PopupTheme {
  const mode = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  let theme = themes.get(mode);
  if (!theme) {
    theme = readTheme(mode);
    themes.set(mode, theme);
  }
  return theme;
}

// `rgb(38, 38, 38)` as `#262626`, which the native webview takes as its
// background; anything else falls back to the card's dark surface.
export function hexColor(color: string): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  if (!m) return "#262626";
  return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
}
