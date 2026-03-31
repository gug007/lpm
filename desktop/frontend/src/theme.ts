export type Theme = "light" | "dark" | "system";

export function isDarkTheme(theme: Theme): boolean {
  return (
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

export function applyTheme(theme: Theme) {
  const dark = isDarkTheme(theme);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  return dark;
}
