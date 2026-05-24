import { useState } from "react";
import { EmojiPicker } from "frimousse";

const SUGGESTED_EMOJIS = [
  "🚀", "✨", "🔥", "⚡", "💎", "🎯", "🏆", "📈",
  "📦", "🛠️", "💻", "🤖", "🎨", "⭐", "💡", "📁",
];

const COLUMNS = 8;

interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void;
}

/**
 * The picker UI: search box, suggested row, and the full emoji list. Plain
 * presentational component — positioning and outside-click are the caller's
 * responsibility.
 */
export function EmojiPickerPanel({ onSelect }: EmojiPickerPanelProps) {
  const [search, setSearch] = useState("");

  return (
    <EmojiPicker.Root
      className="isolate flex h-[300px] w-full flex-col"
      columns={COLUMNS}
      onEmojiSelect={({ emoji }) => onSelect(emoji)}
    >
      <EmojiPicker.Search
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mx-2 mt-2 appearance-none rounded-md border border-transparent bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
      />
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        {search === "" && <SuggestedRow onSelect={onSelect} />}
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-muted)]">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-muted)]">
          No matches
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                {...props}
                className="bg-[var(--bg-secondary)] px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]"
              >
                {category.label}
              </div>
            ),
            Row: ({ children, style, ...props }) => (
              <div
                {...props}
                style={{
                  ...style,
                  display: "grid",
                  gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
                }}
                className="scroll-my-1 gap-0.5 px-1.5"
              >
                {children}
              </div>
            ),
            Emoji: ({ emoji, onPointerDown, ...props }) => (
              <EmojiButton
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPointerDown?.(e);
                }}
                {...props}
              >
                {emoji.emoji}
              </EmojiButton>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}

function SuggestedRow({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="border-b border-[var(--border)]">
      <div className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Suggested
      </div>
      <div
        className="grid gap-0.5 px-1.5 pb-2"
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
      >
        {SUGGESTED_EMOJIS.map((emoji) => (
          <EmojiButton
            key={emoji}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onSelect(emoji)}
          >
            <span aria-hidden>{emoji}</span>
          </EmojiButton>
        ))}
      </div>
    </div>
  );
}

function EmojiButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="flex aspect-square items-center justify-center rounded-md text-xl transition-colors hover:bg-[var(--bg-hover)] data-[active]:bg-[var(--bg-hover)]"
    >
      {children}
    </button>
  );
}
