import { iconForFile } from "./file-icons";

// The Seti glyph VS Code and Cursor show beside this file name, in a fixed slot
// so names line up with the folder chevrons above them.
export function FileTypeIcon({ name }: { name: string }) {
  const icon = iconForFile(name);
  return (
    <span className="flex w-[26px] shrink-0 items-center justify-center">
      <span aria-hidden className="seti-icon" style={{ color: icon.color }}>
        {icon.glyph}
      </span>
    </span>
  );
}
