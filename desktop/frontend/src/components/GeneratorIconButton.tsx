import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import type { GeneratorIcon } from "../types";
import { PickImageFile, SaveGeneratorIcon } from "../../bridge/commands";
import { GeneratorIconView } from "./generatorIcons";
import { EmojiPickerPanel } from "./EmojiPickerPanel";

const PANEL_WIDTH = 300;

interface GeneratorIconButtonProps {
  value: GeneratorIcon;
  generatorId: string;
  onChange: (icon: GeneratorIcon) => void;
}

// A single icon trigger: it shows the current icon and opens one popover that
// holds both the emoji grid and an "upload image" action — replacing the older
// tile + emoji/image toggle with a single control.
export function GeneratorIconButton({ value, generatorId, onChange }: GeneratorIconButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - PANEL_WIDTH));
      setStyle({ position: "fixed", top: r.bottom + 8, left, width: PANEL_WIDTH });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pickImage = async () => {
    const src = await PickImageFile();
    if (!src) return;
    const stable = await SaveGeneratorIcon(src, generatorId);
    onChange({ type: "image", value: stable });
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose icon"
        aria-pressed={open}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-[var(--bg-secondary)] transition-colors hover:bg-[var(--bg-hover)] ${
          open ? "border-[var(--accent-cyan)]" : "border-[var(--border)]"
        }`}
      >
        <GeneratorIconView icon={value} size={22} />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={popRef}
            style={style}
            className="z-[70] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl"
          >
            <button
              type="button"
              onClick={pickImage}
              className="flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <ImageIcon size={14} />
              Upload image…
            </button>
            <EmojiPickerPanel
              onSelect={(emoji) => {
                onChange({ type: "emoji", value: emoji });
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
