import type { StatusEntry } from "../types";

// Map common icon names to unicode/emoji equivalents
const iconMap: Record<string, string> = {
  "bolt": "⚡",
  "bolt.fill": "⚡",
  "circle": "●",
  "circle.fill": "●",
  "hammer": "🔨",
  "sparkle": "✨",
  "exclamationmark.triangle": "⚠️",
  "checkmark": "✓",
  "xmark": "✕",
  "hourglass": "⏳",
  "gear": "⚙",
  "play": "▶",
  "stop": "■",
  "pause": "⏸",
};

function resolveIcon(icon?: string): string | null {
  if (!icon) return null;
  if (icon.startsWith("emoji:")) return icon.slice(6);
  if (icon.startsWith("text:")) return icon.slice(5);
  return iconMap[icon] || icon.charAt(0).toUpperCase();
}

interface StatusPillProps {
  entries: StatusEntry[];
}

export function StatusPill({ entries }: StatusPillProps) {
  if (!entries || entries.length === 0) return null;

  // Show max 2 entries inline
  const visible = entries.slice(0, 2);
  const overflow = entries.length - 2;

  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {visible.map((entry) => {
        const icon = resolveIcon(entry.icon);
        const color = entry.color || "var(--text-muted)";
        return (
          <span
            key={entry.key}
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium leading-4"
            style={{
              backgroundColor: entry.color ? `${entry.color}20` : "var(--bg-hover)",
              color: color,
            }}
            title={`${entry.key}: ${entry.value}`}
          >
            {icon && <span className="text-[9px]">{icon}</span>}
            <span className="truncate max-w-[80px]">{entry.value}</span>
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="text-[9px] text-[var(--text-muted)]">+{overflow}</span>
      )}
    </div>
  );
}
