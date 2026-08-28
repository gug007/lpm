"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { Play, Terminal as TerminalIcon } from "lucide-react";
import { EmojiPickerField } from "./tab-controls";
import { FOCUS_RING } from "./ui";
import {
  DialogHeader,
  DialogPanel,
  FIELD_CLASS,
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  Switch,
} from "./ui-kit";

export type NewActionRunMode = "once" | "terminal";

export type NewActionInput = {
  name: string;
  emoji?: string;
  cmd: string;
  runMode: NewActionRunMode;
  confirm: boolean;
};

export function DemoAddActionModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewActionInput) => void;
}) {
  if (!open) return null;
  return <AddActionForm onClose={onClose} onCreate={onCreate} />;
}

function AddActionForm({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: NewActionInput) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🚀");
  const [cmd, setCmd] = useState("");
  const [runMode, setRunMode] = useState<NewActionRunMode>("terminal");
  const [confirm, setConfirm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const canSubmit = name.trim().length > 0 && cmd.trim().length > 0;

  const create = () => {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      emoji: emoji || undefined,
      cmd: cmd.trim(),
      runMode,
      confirm,
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      create();
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <DialogPanel
        className="relative max-w-[calc(100%-2rem)]"
        aria-label="New action"
      >
        <form onSubmit={submit} onKeyDown={onKeyDown} autoComplete="off">
          <DialogHeader
            title="New action"
            description="A one-click shortcut for a command you run all the time — tests, builds, deploys, migrations."
            onClose={onClose}
          />

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <FieldLabel>Name</FieldLabel>
              <EmojiPickerField emoji={emoji} onChange={setEmoji} inputRef={nameRef}>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Run Tests"
                  {...NO_AUTOFILL}
                  className={`${FIELD_CLASS} pl-12`}
                />
              </EmojiPickerField>
            </div>

            <div>
              <FieldLabel>Command</FieldLabel>
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                placeholder="pnpm test"
                {...NO_AUTOFILL}
                className={`${FIELD_CLASS} font-mono`}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-[#b3b3b3]">
                  When run
                </span>
                <span className="text-[12px] text-[#919191]">
                  {runMode === "terminal"
                    ? "Good for servers & long tasks."
                    : "Shows output in a pop-up."}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#242424] p-1">
                <ModeOption
                  active={runMode === "terminal"}
                  onClick={() => setRunMode("terminal")}
                  icon={<TerminalIcon className="h-3.5 w-3.5" />}
                  label="Open terminal"
                />
                <ModeOption
                  active={runMode === "once"}
                  onClick={() => setRunMode("once")}
                  icon={<Play className="h-3.5 w-3.5" />}
                  label="Run once"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[#b3b3b3]">
                Ask for confirmation before running
              </span>
              <Switch
                checked={confirm}
                onChange={setConfirm}
                aria-label="Ask for confirmation before running"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#2e2e2e] pt-4">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2"
            >
              Add action
              <kbd className="font-sans text-[11px] font-normal opacity-50">
                ⌘↵
              </kbd>
            </PrimaryButton>
          </div>
        </form>
      </DialogPanel>
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
        active
          ? "bg-[#1a1a1a] text-[#e5e5e5] shadow-sm"
          : "text-[#919191] hover:text-[#b3b3b3]"
      }`}
    >
      <span className={active ? "" : "opacity-80"}>{icon}</span>
      {label}
    </button>
  );
}
