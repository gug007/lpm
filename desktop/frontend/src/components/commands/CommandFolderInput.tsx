import { useEffect, useRef, useState } from "react";

interface CommandFolderInputProps {
  initial?: string;
  onDone: (name: string | null) => void;
}

// The inline field that names a new folder or renames one: Enter or leaving it
// keeps the name, Escape drops it.
export function CommandFolderInput({ initial = "", onDone }: CommandFolderInputProps) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    onDone(keep && name && name !== initial ? name : null);
  };

  return (
    <input
      ref={ref}
      value={value}
      placeholder="Folder name"
      aria-label="Folder name"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="w-full rounded-md border border-[var(--accent-cyan)] bg-[var(--bg-primary)] px-2 py-1 text-[12.5px] text-[var(--text-primary)] outline-none"
    />
  );
}
