"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { MenuButton } from "./menu-button";
import { MENU_PANEL_CLASS, MenuLayer } from "./menu-layer";
import { Tooltip } from "./tooltip";
import { FOCUS_RING, PRESS } from "./ui";
import {
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

/** The "+" new-tab control. A plain button, the way the app's
 *  AddTerminalButton is: everything else a pane can open lives in the header's
 *  "more" menu now. */
export function AddTabButton({ onAddTerminal }: { onAddTerminal: () => void }) {
  return (
    <Tooltip content="New terminal  ·  ⌘T" side="bottom">
      <button
        type="button"
        onClick={onAddTerminal}
        aria-label="New terminal"
        className={`ml-1.5 flex h-6 shrink-0 items-center justify-center rounded-md px-1.5 text-[#8e8e8e] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

export function TabContextMenu({
  x,
  y,
  pinned,
  onRename,
  onTogglePin,
  onCloseTab,
  onCloseOthers,
  onDismiss,
}: {
  x: number;
  y: number;
  pinned: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onCloseTab: () => void;
  onCloseOthers?: () => void;
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
        style={{ left: x, top: y, minWidth: 160 }}
        className={MENU_PANEL_CLASS}
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
          hint="⌘W"
          danger
          onClick={run(onCloseTab)}
        />
        {onCloseOthers && (
          <MenuButton
            icon={<X className="h-3.5 w-3.5" />}
            label="Close Other Tabs"
            danger
            onClick={run(onCloseOthers)}
          />
        )}
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape belongs to whatever is open inside the dialog — the emoji
      // picker claims it first, and only an unclaimed Escape dismisses.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        autoComplete="off"
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
              aria-label="Tab name"
              {...NO_AUTOFILL}
              className={`w-full rounded-lg border border-[#2e2e2e] bg-transparent py-2.5 text-base text-[#e5e5e5] outline-none transition-colors placeholder:text-[#919191] focus:border-[#22d3ee] ${
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
            className={`rounded-lg px-3 py-1.5 text-sm font-medium text-[#919191] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={`rounded-lg bg-[#e5e5e5] px-4 py-1.5 text-sm font-medium text-[#1a1a1a] hover:opacity-85 disabled:opacity-30 ${PRESS} ${FOCUS_RING}`}
          >
            Save
          </button>
        </div>
      </form>
    </div>
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

  // The field lives inside dialogs that dismiss on Escape and were mounted
  // first, so the picker takes the key in the capture phase and marks it
  // handled — one Escape closes the picker, not the visitor's half-filled form.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPicking(false);
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picking, inputRef]);
  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        aria-label="Pick an icon"
        className={`absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#2e2e2e] bg-[#242424] text-[15px] text-[#b3b3b3] hover:bg-[#2a2a2a] ${PRESS} ${FOCUS_RING}`}
      >
        {emoji || <TerminalIcon className="h-4 w-4" />}
      </button>
      {children}
      {picking && (
        <div className="menu-pop absolute left-0 top-full z-10 mt-1.5 w-full rounded-xl border border-[#2e2e2e] bg-[#242424] p-2 shadow-2xl">
          <div className="grid grid-cols-8 gap-0.5">
            {SUGGESTED_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => pick(em)}
                className={`flex aspect-square items-center justify-center rounded-md text-lg transition-colors hover:bg-[#2a2a2a] ${
                  emoji === em ? "bg-[#2a2a2a]" : ""
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
