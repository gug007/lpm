// ANSI color palette matching iTerm2 defaults for consistent rendering
export const ansiColors = {
  black: "#000000",
  red: "#c91b00",
  green: "#00c200",
  yellow: "#c7c400",
  blue: "#0225c7",
  magenta: "#c930c7",
  cyan: "#00c5c7",
  white: "#c7c7c7",
  brightBlack: "#686868",
  brightRed: "#ff6e67",
  brightGreen: "#5ffa68",
  brightYellow: "#fffc67",
  brightBlue: "#83a5d6",
  brightMagenta: "#ff77ff",
  brightCyan: "#60fdff",
  brightWhite: "#ffffff",
};

export function getTerminalTheme(el?: Element | null) {
  const style = getComputedStyle(el || document.documentElement);
  return {
    background: style.getPropertyValue("--terminal-bg").trim() || "#0d0d0d",
    foreground: style.getPropertyValue("--terminal-fg").trim() || "#cccccc",
    selectionBackground: style.getPropertyValue("--terminal-selection").trim() || "#444444",
    cursor: style.getPropertyValue("--terminal-cursor").trim() || "#cccccc",
    ...ansiColors,
  };
}
