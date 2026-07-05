"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Play, Terminal as TerminalIcon } from "lucide-react";
import { EmojiPickerField } from "./tab-controls";

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      emoji: emoji || undefined,
      cmd: cmd.trim(),
      runMode,
      confirm,
    });
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
        className="relative w-[400px] max-w-[calc(100%-2rem)] rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] p-5 shadow-2xl"
      >
        <div className="text-[13px] font-semibold text-[#e5e5e5]">New action</div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#919191]">
          A one-click shortcut for a command you run all the time — tests, builds,
          deploys, migrations.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
              Name
            </span>
            <EmojiPickerField emoji={emoji} onChange={setEmoji} inputRef={nameRef}>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Run Tests"
                spellCheck={false}
                className="w-full rounded-lg border border-[#2e2e2e] bg-transparent py-2.5 pl-12 pr-3 text-sm text-[#e5e5e5] outline-none transition-colors placeholder:text-[#666] focus:border-cyan-500"
              />
            </EmojiPickerField>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
              Command
            </span>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="pnpm test"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="rounded-lg border border-[#2e2e2e] bg-transparent px-3 py-2.5 font-mono text-[13px] text-[#e5e5e5] outline-none transition-colors placeholder:text-[#666] focus:border-cyan-500"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
              When run
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <ModeOption
                active={runMode === "terminal"}
                onClick={() => setRunMode("terminal")}
                icon={<TerminalIcon className="h-3.5 w-3.5" />}
                label="Open terminal"
                desc="Good for servers & long tasks"
              />
              <ModeOption
                active={runMode === "once"}
                onClick={() => setRunMode("once")}
                icon={<Play className="h-3.5 w-3.5" />}
                label="Run once"
                desc="Shows output in a pop-up"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#b3b3b3]">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-500"
            />
            Ask for confirmation before running
          </label>
        </div>

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
            Add action
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  icon,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? "border-cyan-500/60 bg-cyan-500/10"
          : "border-[#2e2e2e] bg-[#242424] hover:bg-[#2a2a2a]"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#e5e5e5]">
        <span className={active ? "text-cyan-400" : "text-[#919191]"}>{icon}</span>
        {label}
      </span>
      <span className="text-[10px] text-[#919191]">{desc}</span>
    </button>
  );
}
