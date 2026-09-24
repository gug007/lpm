"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Check, ChevronDown, Server } from "lucide-react";
import { FIELD_CLASS, FieldLabel } from "./ui-kit";
import { FOCUS_RING } from "./ui";

export type SshConfigHost = { name: string; user?: string; port?: number };

// What the app reads out of ~/.ssh/config: each Host alias, with the User and
// Port set for it.
export const SSH_CONFIG_HOSTS: SshConfigHost[] = [
  { name: "devbox" },
  { name: "build-server", user: "ci" },
  { name: "staging", user: "deploy", port: 2222 },
];

export const MANUAL_HOST = "__manual__";

const hostLabel = (host: SshConfigHost) =>
  host.user ? `${host.name} — ${host.user}` : host.name;

// The app's "Connect to Host…" dropdown: the hosts in your SSH config, then
// a way to type one in by hand.
export function SshHostPicker({
  hosts,
  picked,
  onPick,
  triggerRef,
}: {
  hosts: SshConfigHost[];
  picked: string;
  // `trusted` says whether a visitor made the pick rather than the tour.
  onPick: (value: string, trusted: boolean) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const match = hosts.find((h) => h.name === picked);
  const label =
    picked === MANUAL_HOST ? "Enter manually…" : match ? hostLabel(match) : "";

  const choose = (value: string, event: React.MouseEvent) => {
    onPick(value, event.nativeEvent.isTrusted);
    setOpen(false);
  };

  return (
    <div className="col-span-2">
      <FieldLabel>Connect to Host…</FieldLabel>
      <div ref={ref} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-tour="ssh-host-picker"
          data-host={match?.name}
          className={`${FIELD_CLASS} flex items-center justify-between text-left ${
            open ? "border-[#22d3ee]" : ""
          }`}
        >
          <span className={label ? "" : "text-[#919191]"}>
            {label || "Select a host…"}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            className={`text-[#919191] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div
            role="listbox"
            aria-label="Hosts from ~/.ssh/config"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-xl"
          >
            {hosts.map((host) => {
              const selected = picked === host.name;
              return (
                <button
                  key={host.name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-tour={`ssh-host:${host.name}`}
                  onClick={(event) => choose(host.name, event)}
                  className={`group flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#2a2a2a] ${FOCUS_RING} ${
                    selected ? "bg-[#2a2a2a]" : ""
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#242424] text-[#919191] group-hover:text-[#e5e5e5]">
                    <Server size={14} strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-[#e5e5e5]">{host.name}</span>
                    {host.user && (
                      <span className="text-[#919191]"> — {host.user}</span>
                    )}
                  </span>
                  {selected && <Check size={14} className="text-[#e5e5e5]" />}
                </button>
              );
            })}
            <div className="my-1 border-t border-[#2e2e2e]" />
            <button
              type="button"
              role="option"
              aria-selected={picked === MANUAL_HOST}
              onClick={(event) => choose(MANUAL_HOST, event)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#2a2a2a] ${FOCUS_RING} ${
                picked === MANUAL_HOST ? "bg-[#2a2a2a]" : ""
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#919191]">
                +
              </span>
              <span className="flex-1 text-[#b3b3b3]">Enter manually…</span>
              {picked === MANUAL_HOST && (
                <Check size={14} className="text-[#e5e5e5]" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
