import { useRef, useState } from "react";

interface RenameInputProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function RenameInput({ initialValue, onCommit, onCancel }: RenameInputProps) {
  const [value, setValue] = useState(initialValue);
  // Escape unmounts this input synchronously, which fires onBlur right after
  // and would otherwise commit the value the user just abandoned.
  const cancelledRef = useRef(false);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (cancelledRef.current) return;
        onCommit(value);
      }}
      onFocus={(e) => e.currentTarget.select()}
      className="min-w-0 flex-1 rounded border border-[var(--accent-cyan)] bg-[var(--bg-primary)] px-1 py-0 text-sm text-[var(--text-primary)] outline-none"
    />
  );
}
