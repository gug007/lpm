import { FileIcon } from "../icons";

export function BinaryFilePlaceholder({ path }: { path: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
      <FileIcon size={22} />
      <span className="text-xs">Binary file not shown</span>
      <span className="max-w-[80%] truncate text-[11px] text-[var(--text-muted)]/70">
        {path}
      </span>
    </div>
  );
}
