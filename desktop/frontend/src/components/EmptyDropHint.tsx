import { useActionsDragActive } from "./ActionsDnd";

interface EmptyDropHintProps {
  compact: boolean;
}

export function EmptyDropHint({ compact }: EmptyDropHintProps) {
  const dragging = useActionsDragActive();
  if (!dragging) return null;
  return (
    <div
      className={`flex items-center border border-dashed border-[var(--accent-blue)]/50 px-2 text-center text-[10px] text-[var(--accent-blue)] ${compact ? "h-6 rounded-md" : "h-7 rounded-lg"}`}
    >
      Drop here
    </div>
  );
}
