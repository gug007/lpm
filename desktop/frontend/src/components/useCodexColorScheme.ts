import { useLayoutEffect, useState, type CSSProperties } from "react";
import {
  codexStatusLineColorScheme,
  type CodexStatusLineColorScheme,
} from "./codexStatusLineColors";

// The terminal theme's background, or the app's when the theme sets none.
function readScheme(themeStyle: CSSProperties | undefined): CodexStatusLineColorScheme {
  const fromTheme = (themeStyle as Record<string, unknown> | undefined)?.["--terminal-bg"];
  const background =
    typeof fromTheme === "string"
      ? fromTheme
      : getComputedStyle(document.documentElement).getPropertyValue("--terminal-bg");
  return codexStatusLineColorScheme(background.trim());
}

/** Whether Codex would draw its colors for a light or a dark terminal here,
 *  following the terminal theme and the app's light/dark switch. */
export function useCodexColorScheme(
  themeStyle: CSSProperties | undefined,
): CodexStatusLineColorScheme {
  const [scheme, setScheme] = useState(() => readScheme(themeStyle));
  useLayoutEffect(() => {
    const update = () => setScheme(readScheme(themeStyle));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [themeStyle]);
  return scheme;
}
