import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  GetSuggestedPorts,
  ListPortForwards,
} from "../../../wailsjs/go/main/App";
import { BrowserOpenURL, EventsOn } from "../../../wailsjs/runtime/runtime";
import type { main } from "../../../wailsjs/go/models";
import { PortForwardIcon } from "../icons";
import { PortsPopover } from "./PortsPopover";

interface PortsButtonProps {
  projectName: string;
}

export function PortsButton({ projectName }: PortsButtonProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [forwards, setForwards] = useState<main.PortForward[]>([]);
  const [suggestions, setSuggestions] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [list, pending] = await Promise.all([
        ListPortForwards(projectName),
        GetSuggestedPorts(projectName),
      ]);
      if (cancelled) return;
      setForwards(list);
      setSuggestions(pending);
    };
    void refresh();
    const off = EventsOn("ports-changed", (changed: string) => {
      if (changed === projectName) void refresh();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [projectName]);

  useEffect(() => {
    const offForwarded = EventsOn(
      "port-auto-forwarded",
      (data: { project: string; remotePort: number; localPort: number }) => {
        if (data.project !== projectName) return;
        const url = `http://localhost:${data.localPort}`;
        toast.success(`Auto-forwarded :${data.remotePort} → ${url}`, {
          action: { label: "Open", onClick: () => BrowserOpenURL(url) },
        });
      },
    );
    const offFailed = EventsOn(
      "port-forward-failed",
      (data: { project: string; remotePort: number; error: string }) => {
        if (data.project !== projectName) return;
        toast.error(`Auto-forward :${data.remotePort} failed: ${data.error}`);
      },
    );
    return () => {
      offForwarded();
      offFailed();
    };
  }, [projectName]);

  const forwardCount = forwards.length;
  const suggestionCount = suggestions.length;
  const active = showPopover || forwardCount > 0;

  return (
    <div className="relative" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
      <button
        onClick={() => setShowPopover((v) => !v)}
        aria-label="Forwarded ports"
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
          active
            ? "border-transparent bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <PortForwardIcon />
        Ports
        {forwardCount > 0 && (
          <span className="ml-0.5 rounded-full bg-[var(--accent-green)]/20 px-1.5 py-0 text-[10px] text-[var(--accent-green)]">
            {forwardCount}
          </span>
        )}
        {suggestionCount > 0 && forwardCount === 0 && (
          <span className="ml-0.5 rounded-full bg-[var(--accent-blue)]/20 px-1.5 py-0 text-[10px] text-[var(--accent-blue)]">
            {suggestionCount} new
          </span>
        )}
      </button>
      {showPopover && (
        <PortsPopover
          projectName={projectName}
          forwards={forwards}
          suggestions={suggestions}
          onClose={() => setShowPopover(false)}
        />
      )}
    </div>
  );
}
