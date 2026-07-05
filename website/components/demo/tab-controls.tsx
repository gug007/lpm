"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronDown,
  Code,
  Globe,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

export const SUGGESTED_EMOJIS = [
  "✻", "◆", "🤖", "🚀", "✨", "🔥", "⚡", "💎",
  "🎯", "🏆", "📈", "🧪", "🚢", "🔨", "🗄️", "🌐",
  "📦", "🛠️", "💻", "🎨", "⭐", "💡", "📁", "📊",
];

/** The "+" new-tab control, now a split button: terminal by default, with a
 *  dropdown for opening an in-pane browser. Mirrors the desktop app. */
export function AddTabSplitButton({
  onAddTerminal,
  onAddBrowser,
  onAddReview,
}: {
  onAddTerminal: () => void;
  onAddBrowser: () => void;
  onAddReview: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const toggle = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = ref.current?.getBoundingClientRect();
    if (r) setMenu({ x: r.left, y: r.bottom + 4 });
  };

  const half =
    "flex items-center py-0.5 text-[#a0a0a0] transition-colors hover:bg-white/[0.08] hover:text-gray-100";

  return (
    <div
      ref={ref}
      className="ml-1 flex shrink-0 items-center rounded-md bg-white/[0.04]"
    >
      <button
        type="button"
        onClick={onAddTerminal}
        title="New terminal"
        aria-label="New terminal"
        className={`${half} rounded-l-md pl-2 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70`}
      >
        <Plus className="h-3 w-3" />
      </button>
      <span className="h-3 w-px self-center bg-white/15" />
      <button
        type="button"
        onClick={toggle}
        title="More options"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className={`${half} rounded-r-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
          menu ? "bg-white/[0.1] text-gray-100" : "opacity-70 hover:opacity-100"
        }`}
      >
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {menu && (
        <MenuLayer onClose={() => setMenu(null)}>
          <div
            role="menu"
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-[70] min-w-[180px] overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#242424] py-1 shadow-xl"
          >
            <MenuButton
              icon={<Code className="h-3.5 w-3.5" />}
              label="Review changes"
              hint="⌘⇧R"
              onClick={() => {
                onAddReview();
                setMenu(null);
              }}
            />
            <MenuButton
              icon={<Globe className="h-3.5 w-3.5" />}
              label="Open browser"
              onClick={() => {
                onAddBrowser();
                setMenu(null);
              }}
            />
          </div>
        </MenuLayer>
      )}
    </div>
  );
}

export function TabContextMenu({
  x,
  y,
  pinned,
  onRename,
  onTogglePin,
  onCloseTab,
  onDismiss,
}: {
  x: number;
  y: number;
  pinned: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onCloseTab: () => void;
  onDismiss: () => void;
}) {
  const run = (fn: () => void) => () => {
    fn();
    onDismiss();
  };
  return (
    <MenuLayer onClose={onDismiss}>
      <div
        role="menu"
        style={{ left: x, top: y }}
        className="fixed z-[70] min-w-[150px] overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#242424] py-1 shadow-xl"
      >
        <MenuButton
          icon={<Pencil className="h-3.5 w-3.5" />}
          label="Rename"
          onClick={run(onRename)}
        />
        <MenuButton
          icon={pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          label={pinned ? "Unpin" : "Pin"}
          onClick={run(onTogglePin)}
        />
        <MenuButton
          icon={<X className="h-3.5 w-3.5" />}
          label="Close"
          danger
          onClick={run(onCloseTab)}
        />
      </div>
    </MenuLayer>
  );
}

export function TabRenameModal({
  open,
  withEmoji,
  initialValue,
  initialEmoji,
  onClose,
  onSubmit,
}: {
  open: boolean;
  withEmoji: boolean;
  initialValue: string;
  initialEmoji: string;
  onClose: () => void;
  onSubmit: (value: string, emoji?: string) => void;
}) {
  if (!open) return null;
  return (
    <TabRenameForm
      withEmoji={withEmoji}
      initialValue={initialValue}
      initialEmoji={initialEmoji}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function TabRenameForm({
  withEmoji,
  initialValue,
  initialEmoji,
  onClose,
  onSubmit,
}: {
  withEmoji: boolean;
  initialValue: string;
  initialEmoji: string;
  onClose: () => void;
  onSubmit: (value: string, emoji?: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [emoji, setEmoji] = useState(initialEmoji);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const trimmed = value.trim();
  const canSubmit =
    trimmed.length > 0 && (trimmed !== initialValue.trim() || emoji !== initialEmoji);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed, withEmoji ? emoji : undefined);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <form
        onSubmit={submit}
        className="relative w-[360px] rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] p-5 shadow-2xl"
      >
        <div className="text-[11px] font-medium uppercase tracking-wider text-[#919191]">
          Rename tab
        </div>
        {(() => {
          const field = (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`w-full rounded-lg border border-[#2e2e2e] bg-transparent py-2.5 text-base text-[#e5e5e5] outline-none transition-colors placeholder:text-[#666] focus:border-cyan-500 ${
                withEmoji ? "pl-12 pr-3" : "px-3"
              }`}
            />
          );
          return withEmoji ? (
            <EmojiPickerField
              emoji={emoji}
              onChange={setEmoji}
              inputRef={inputRef}
              allowRemove
              className="mt-2"
            >
              {field}
            </EmojiPickerField>
          ) : (
            <div className="mt-2">{field}</div>
          );
        })()}
        <div className="mt-5 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#919191] transition-colors hover:text-[#e5e5e5]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-gray-900 transition-opacity hover:opacity-85 disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function MenuLayer({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-[65] cursor-default"
      />
      {children}
    </>
  );
}

/** Text field with a leading emoji-picker trigger and a popover of suggested
 *  icons. Render the `<input>` (or any field) as the child. */
export function EmojiPickerField({
  emoji,
  onChange,
  inputRef,
  allowRemove,
  className,
  children,
}: {
  emoji: string;
  onChange: (emoji: string) => void;
  inputRef: { current: HTMLInputElement | null };
  allowRemove?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const pick = (em: string) => {
    onChange(em);
    setPicking(false);
    inputRef.current?.focus();
  };
  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        title="Pick an icon"
        className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#2e2e2e] bg-[#242424] text-[15px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a]"
      >
        {emoji || <TerminalIcon className="h-4 w-4" />}
      </button>
      {children}
      {picking && (
        <div className="absolute left-0 top-full z-10 mt-1.5 w-full rounded-xl border border-[#2e2e2e] bg-[#242424] p-2 shadow-xl">
          <div className="grid grid-cols-8 gap-0.5">
            {SUGGESTED_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => pick(em)}
                className={`flex aspect-square items-center justify-center rounded-md text-lg transition-colors hover:bg-[#2f2f2f] ${
                  emoji === em ? "bg-[#2f2f2f]" : ""
                }`}
              >
                {em}
              </button>
            ))}
          </div>
          {allowRemove && emoji && (
            <button
              type="button"
              onClick={() => pick("")}
              className="mt-1.5 w-full rounded-md px-2 py-1 text-left text-[11px] text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
            >
              Remove icon
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  danger,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[#2a2a2a] ${
        danger ? "text-red-400 hover:text-red-300" : "text-[#b3b3b3] hover:text-[#e5e5e5]"
      }`}
    >
      <span className="shrink-0 text-[#919191]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 font-mono text-[10px] text-[#666]">{hint}</span>
      )}
    </button>
  );
}
