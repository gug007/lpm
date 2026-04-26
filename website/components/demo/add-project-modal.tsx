"use client";

import { useEffect, useRef, useState } from "react";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function FolderIcon() {
  return (
    <svg {...ICON_PROPS} width={22} height={22}>
      <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg {...ICON_PROPS} width={22} height={22}>
      <rect x="2" y="3" width="20" height="8" rx="2" />
      <rect x="2" y="13" width="20" height="8" rx="2" />
      <line x1="6" y1="7" x2="6.01" y2="7" />
      <line x1="6" y1="17" x2="6.01" y2="17" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg {...ICON_PROPS} width={14} height={14}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export type NewProjectKind = "local" | "ssh";

export type NewProjectInput = {
  kind: NewProjectKind;
  name: string;
  host?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
};

type Phase = "pick" | "local" | "ssh";

export function DemoAddProjectModal({ open, onClose, onCreate }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase !== "pick") nameRef.current?.focus();
  }, [phase]);

  if (!open) return null;

  const reset = () => {
    setPhase("pick");
    setName("");
    setHost("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (phase === "local") {
      onCreate({ kind: "local", name: trimmed });
      reset();
    } else if (phase === "ssh") {
      const h = host.trim();
      if (!h) return;
      onCreate({ kind: "ssh", name: trimmed, host: h });
      reset();
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={handleClose}
        className="absolute inset-0 bg-black/50"
      />

      {phase === "pick" && (
        <div className="relative w-[360px] rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] px-2 pb-2 pt-5 shadow-2xl">
          <h3 className="px-4 text-[13px] font-medium text-[#e5e5e5]">
            Add a project
          </h3>
          <div className="mt-3 flex flex-col">
            <button
              type="button"
              onClick={() => setPhase("local")}
              className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[#2a2a2a]"
            >
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2a] transition-colors group-hover:bg-[#333333]"
                style={{ color: "#facc15" }}
              >
                <FolderIcon />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] font-medium text-[#e5e5e5]">
                  Local Folder
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">
                  A project on this machine — pick a folder on disk
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPhase("ssh")}
              className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[#2a2a2a]"
            >
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2a] transition-colors group-hover:bg-[#333333]"
                style={{ color: "#22d3ee" }}
              >
                <ServerIcon />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] font-medium text-[#e5e5e5]">
                  SSH Host
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">
                  Connect to a remote machine over SSH
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {(phase === "local" || phase === "ssh") && (
        <div className="relative w-[360px] rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] px-5 pb-5 pt-4 shadow-2xl">
          <button
            type="button"
            onClick={() => setPhase("pick")}
            className="mb-3 flex items-center gap-1 text-[11px] text-[#919191] transition-colors hover:text-[#e5e5e5]"
          >
            <ChevronLeftIcon />
            Back
          </button>
          <h3 className="text-[13px] font-medium text-[#e5e5e5]">
            {phase === "local" ? "Add a local folder" : "Add an SSH host"}
          </h3>

          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
                Project name
              </span>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={phase === "local" ? "my-app" : "remote-api"}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="rounded-md bg-[#242424] px-2.5 py-1.5 text-[12px] font-mono text-[#e5e5e5] placeholder:text-[#666] outline-none border border-[#2e2e2e] focus:border-[#5a5a5a]"
              />
            </label>

            {phase === "ssh" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
                  Host
                </span>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="user@host.example.com"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="rounded-md bg-[#242424] px-2.5 py-1.5 text-[12px] font-mono text-[#e5e5e5] placeholder:text-[#666] outline-none border border-[#2e2e2e] focus:border-[#5a5a5a]"
                />
                <span className="text-[10px] text-[#666]">
                  Hosts come from <span className="font-mono">~/.ssh/config</span> in
                  the real app
                </span>
              </label>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-1.5 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !name.trim() || (phase === "ssh" && !host.trim())
                }
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-900 transition-all hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
