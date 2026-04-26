import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import {
  AddPortForward,
  ClearPortSuggestions,
  DismissPortSuggestion,
  RemovePortForward,
} from "../../../wailsjs/go/main/App";
import type { main } from "../../../wailsjs/go/models";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { PlusIcon, XIcon } from "../icons";
import { forwardPortAndOpen } from "./forwardPort";
import { LocalPortField } from "./LocalPortField";

interface PortsPopoverProps {
  projectName: string;
  forwards: main.PortForward[];
  suggestions: number[];
  onClose: () => void;
}

const isValidPort = (n: number) => Number.isFinite(n) && n > 0 && n <= 65535;

// One row across the popover can be in edit mode at a time.
type EditTarget =
  | { kind: "forward"; localPort: number; remotePort: number }
  | { kind: "suggestion"; remotePort: number };

export function PortsPopover({ projectName, forwards, suggestions, onClose }: PortsPopoverProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  const [remoteInput, setRemoteInput] = useState("");
  const [localInput, setLocalInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  // Per-suggestion override of the local port. Defaults to the remote
  // port (auto-mirror) until the user edits the inline input.
  const [suggestionLocal, setSuggestionLocal] = useState<Record<number, string>>({});

  // Drop overrides for ports that are no longer suggested so the map
  // doesn't grow over a long session.
  useEffect(() => {
    setSuggestionLocal((prev) => {
      const live = new Set(suggestions);
      let changed = false;
      const next: Record<number, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (live.has(Number(key))) {
          next[Number(key)] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [suggestions]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const remote = parseInt(remoteInput, 10);
    if (!isValidPort(remote)) {
      toast.error("Remote port must be between 1 and 65535");
      return;
    }
    const local = localInput.trim() === "" ? 0 : parseInt(localInput, 10);
    if (local !== 0 && !isValidPort(local)) {
      toast.error("Local port must be between 1 and 65535");
      return;
    }
    setAdding(true);
    try {
      const pf = await AddPortForward(projectName, remote, local);
      setRemoteInput("");
      setLocalInput("");
      toast.success(`Forwarded :${pf.remotePort} → localhost:${pf.localPort}`);
    } catch (err) {
      toast.error(`Forward :${remote}: ${err}`);
    } finally {
      setAdding(false);
    }
  };

  const stop = async (localPort: number, remotePort: number) => {
    try {
      await RemovePortForward(projectName, localPort);
      toast.success(`Stopped forward :${remotePort}`);
    } catch (err) {
      toast.error(`Stop :${remotePort}: ${err}`);
    }
  };

  const acceptSuggestion = (remotePort: number, localStr: string) => {
    const parsed = parseInt(localStr, 10);
    forwardPortAndOpen(projectName, remotePort, isValidPort(parsed) ? parsed : 0);
  };

  const remap = async (remotePort: number, oldLocalPort: number, newLocalStr: string) => {
    const newLocal = parseInt(newLocalStr, 10);
    if (!isValidPort(newLocal) || newLocal === oldLocalPort) {
      return;
    }
    try {
      await RemovePortForward(projectName, oldLocalPort);
      const pf = await AddPortForward(projectName, remotePort, newLocal);
      toast.success(`Remapped :${remotePort} → localhost:${pf.localPort}`);
    } catch (err) {
      toast.error(`Remap :${remotePort}: ${err}`);
    }
  };

  const startEdit = (target: EditTarget, initial: string) => {
    setEditing(target);
    setEditValue(initial);
  };

  const cancelEdit = () => setEditing(null);

  const commitEdit = () => {
    const target = editing;
    if (!target) return;
    setEditing(null);
    if (target.kind === "forward") {
      void remap(target.remotePort, target.localPort, editValue);
    } else {
      setSuggestionLocal((prev) => ({ ...prev, [target.remotePort]: editValue }));
      acceptSuggestion(target.remotePort, editValue);
    }
  };

  const showEmptyState = forwards.length === 0 && suggestions.length === 0;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1.5 w-[28rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
      style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--text-primary)]">Forwarded ports</span>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <XIcon />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="border-b border-[var(--border)] py-1">
          <div className="flex items-center justify-between px-3 pt-1 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Detected on remote
            </span>
            <button
              onClick={() => ClearPortSuggestions(projectName)}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Clear all
            </button>
          </div>
          <ul>
            {suggestions.map((port) => {
              const localStr = suggestionLocal[port] ?? String(port);
              const isEditing = editing?.kind === "suggestion" && editing.remotePort === port;
              return (
                <li
                  key={port}
                  className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
                >
                  <span className="font-mono text-[var(--text-muted)]">remote :{port}</span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <LocalPortField
                    editing={isEditing}
                    value={isEditing ? editValue : localStr}
                    onChange={setEditValue}
                    displayLabel={`localhost:${localStr}`}
                    onDisplayClick={() => acceptSuggestion(port, localStr)}
                    onEdit={() => startEdit({ kind: "suggestion", remotePort: port }, localStr)}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                  />
                  <button
                    onClick={() => DismissPortSuggestion(projectName, port)}
                    className="rounded px-1.5 py-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] group-hover:opacity-100"
                    aria-label={`Dismiss ${port}`}
                  >
                    Dismiss
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showEmptyState && (
        <div className="px-3 py-3 text-xs text-[var(--text-muted)]">
          No active forwards. Add a remote port below to expose it on localhost.
        </div>
      )}

      {forwards.length > 0 && (
        <ul className="max-h-64 overflow-auto py-1">
          {forwards.map((f) => {
            const url = `http://localhost:${f.localPort}`;
            const isEditing =
              editing?.kind === "forward" && editing.localPort === f.localPort;
            return (
              <li
                key={f.localPort}
                className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
              >
                <span className="font-mono text-[var(--text-muted)]">remote :{f.remotePort}</span>
                <span className="text-[var(--text-muted)]">→</span>
                <LocalPortField
                  editing={isEditing}
                  value={isEditing ? editValue : String(f.localPort)}
                  onChange={setEditValue}
                  displayLabel={url}
                  onDisplayClick={() => BrowserOpenURL(url)}
                  onEdit={() =>
                    startEdit(
                      { kind: "forward", localPort: f.localPort, remotePort: f.remotePort },
                      String(f.localPort),
                    )
                  }
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />
                <button
                  onClick={() => stop(f.localPort, f.remotePort)}
                  className="rounded px-1.5 py-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] group-hover:opacity-100"
                  aria-label={`Stop forward ${f.remotePort}`}
                >
                  Stop
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={65535}
          value={remoteInput}
          onChange={(e) => setRemoteInput(e.target.value)}
          placeholder="Remote"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-sidebar)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:outline-none"
          disabled={adding}
        />
        <span className="text-[var(--text-muted)]">→</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={65535}
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder="Local (auto)"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-sidebar)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:outline-none"
          disabled={adding}
        />
        <button
          type="submit"
          disabled={adding || !remoteInput}
          className="flex items-center gap-1 rounded-md bg-[var(--text-primary)] px-2 py-1 text-xs font-medium text-[var(--bg-primary)] transition-opacity disabled:opacity-40 hover:opacity-85"
        >
          <PlusIcon />
          Forward
        </button>
      </form>
    </div>
  );
}
