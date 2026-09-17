import { FileIcon } from "../icons";
import { badgeForFile } from "./fileTypeBadge";

// A fixed-width slot, so names line up whether a file has a type badge or the
// generic glyph.
export function FileTypeIcon({ name }: { name: string }) {
  const badge = badgeForFile(name);
  if (!badge) {
    return (
      <span className="flex w-[26px] shrink-0 items-center justify-center text-[var(--text-muted)]">
        <FileIcon size={12} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-[15px] w-[26px] shrink-0 items-center justify-center rounded-[3px] font-mono text-[8px] font-semibold leading-none tracking-tight"
      style={{
        background: `color-mix(in srgb, var(--accent-${badge.tone}) 16%, transparent)`,
        color: `var(--accent-${badge.tone}-text)`,
      }}
    >
      {badge.label}
    </span>
  );
}
