interface ExtractPlaceholderProps {
  compact: boolean;
}

export function ExtractPlaceholder({ compact }: ExtractPlaceholderProps) {
  return (
    <div
      aria-hidden
      className={`shrink-0 border-2 border-dashed border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ${
        compact ? "h-6 w-14 rounded-md" : "h-7 w-16 rounded-lg"
      }`}
    />
  );
}
