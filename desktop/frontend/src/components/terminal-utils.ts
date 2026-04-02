export function getTerminalTheme(el?: Element | null) {
  const style = getComputedStyle(el || document.documentElement);
  return {
    background: style.getPropertyValue("--terminal-bg").trim() || "#0d0d0d",
    foreground: style.getPropertyValue("--terminal-fg").trim() || "#cccccc",
    selectionBackground: style.getPropertyValue("--terminal-selection").trim() || "#444444",
    cursor: style.getPropertyValue("--terminal-cursor").trim() || "#cccccc",
  };
}
