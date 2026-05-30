"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Play, Terminal as TerminalIcon } from "lucide-react";
import { SUGGESTED_EMOJIS } from "./tab-controls";

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
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🚀");
  const [cmd, setCmd] = useState("");
  const [runMode, setRunMode] = useState<NewActionRunMode>("once");
  const [confirm, setConfirm] = useState(false);
  const [picking, setPicking] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmoji("🚀");
    setCmd("");
    setRunMode("once");
    setConfirm(false);
    setPicking(false);
    const id = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

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
        <h3 className="text-[13px] font-semibold text-[#e5e5e5]">New action</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#919191]">
          A one-click shortcut for a command you run all the time — tests, builds,
          deploys, migrations.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
              Name
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                title="Pick an icon"
                className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-[#2e2e2e] bg-[#242424] text-[15px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a]"
              >
                {emoji || <TerminalIcon className="h-4 w-4" />}
              </button>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Run Tests"
                spellCheck={false}
                className="w-full rounded-lg border border-[#2e2e2e] bg-transparent py-2.5 pl-12 pr-3 text-sm text-[#e5e5e5] outline-none transition-colors placeholder:text-[#666] focus:border-cyan-500"
              />
              {picking && (
                <div className="absolute left-0 top-full z-10 mt-1.5 w-full rounded-xl border border-[#2e2e2e] bg-[#242424] p-2 shadow-xl">
                  <div className="grid grid-cols-8 gap-0.5">
                    {SUGGESTED_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          setEmoji(em);
                          setPicking(false);
                          nameRef.current?.focus();
                        }}
                        className={`flex aspect-square items-center justify-center rounded-md text-lg transition-colors hover:bg-[#2f2f2f] ${
                          emoji === em ? "bg-[#2f2f2f]" : ""
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                active={runMode === "once"}
                onClick={() => setRunMode("once")}
                icon={<Play className="h-3.5 w-3.5" />}
                label="Run once"
                desc="Runs and finishes"
              />
              <ModeOption
                active={runMode === "terminal"}
                onClick={() => setRunMode("terminal")}
                icon={<TerminalIcon className="h-3.5 w-3.5" />}
                label="Open terminal"
                desc="Keeps a tab open"
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
