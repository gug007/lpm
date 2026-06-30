import { useRef, useState } from "react";
import type { GeneratorIcon } from "../types";
import { PickImageFile, SaveGeneratorIcon } from "../../bridge/commands";
import { GeneratorIconView } from "./generatorIcons";
import { EmojiSlotButton } from "./EmojiPickerButton";

interface GeneratorIconPickerProps {
  value: GeneratorIcon;
  generatorId: string;
  onChange: (icon: GeneratorIcon) => void;
}

export function GeneratorIconPicker({ value, generatorId, onChange }: GeneratorIconPickerProps) {
  const [mode, setMode] = useState<"emoji" | "image">(value.type === "image" ? "image" : "emoji");
  const emojiAnchorRef = useRef<HTMLInputElement | null>(null);

  const pickImage = async () => {
    const src = await PickImageFile();
    if (!src) return;
    const stable = await SaveGeneratorIcon(src, generatorId);
    onChange({ type: "image", value: stable });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-9 w-9 rounded-lg border border-[var(--border)]">
        <input
          ref={emojiAnchorRef}
          readOnly
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
        {mode === "emoji" ? (
          <EmojiSlotButton
            fill
            inputRef={emojiAnchorRef}
            value={value.type === "emoji" ? value.value : ""}
            onSelect={(emoji) => onChange({ type: "emoji", value: emoji })}
          />
        ) : (
          <button
            type="button"
            title="Choose an image…"
            onClick={pickImage}
            className="absolute inset-0 grid place-items-center rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
          >
            <GeneratorIconView icon={value} size={22} />
          </button>
        )}
      </div>
      <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-xs">
        <button
          type="button"
          className={`px-3 py-1.5 ${mode === "emoji" ? "bg-[var(--bg-active)]" : ""}`}
          onClick={() => setMode("emoji")}
        >
          😀 Emoji
        </button>
        <button
          type="button"
          className={`border-l border-[var(--border)] px-3 py-1.5 ${mode === "image" ? "bg-[var(--bg-active)]" : ""}`}
          onClick={() => setMode("image")}
        >
          🖼 Image
        </button>
      </div>
    </div>
  );
}
