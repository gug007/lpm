import type { CSSProperties } from "react";
import { iconForFile } from "./fileIcons";

// The Seti glyph VS Code and Cursor show beside this file name, in a fixed
// slot so names line up.
export function FileTypeIcon({ name }: { name: string }) {
  const icon = iconForFile(name);
  return (
    <span className="flex w-[26px] shrink-0 items-center justify-center">
      <span
        aria-hidden
        className="seti-icon"
        style={
          {
            "--seti-dark": icon.dark || "currentColor",
            "--seti-light": icon.light || "currentColor",
          } as CSSProperties
        }
      >
        {icon.glyph}
      </span>
    </span>
  );
}
