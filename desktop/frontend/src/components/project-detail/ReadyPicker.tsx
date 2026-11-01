import { listPhrase } from "../../cronDescribe";
import { readyDraftError, type ReadyDraft, type ReadyKind } from "../../serviceReady";
import { GlobeIcon, PortForwardIcon, TerminalIcon, XIcon } from "../icons";
import { ModeButton } from "./ModeButton";

interface ReadyPickerProps {
  value: ReadyDraft;
  onChange: (next: ReadyDraft) => void;
  // The port the form has for this service, which "Port open" checks by default.
  servicePort: number;
  // Services that list this one in dependsOn and so wait for it.
  dependents: string[];
}

const fieldClass =
  "rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]";

const PLACEHOLDER: Record<Exclude<ReadyKind, "">, string> = {
  port: "",
  url: "http://localhost:3000/health",
  log: "ready in",
};

function waitersText(dependents: string[]): string {
  if (dependents.length === 0) return "Its tab shows Starting until then.";
  return `${listPhrase(dependents)} ${dependents.length === 1 ? "waits" : "wait"} for this.`;
}

export function ReadyPicker({ value, onChange, servicePort, dependents }: ReadyPickerProps) {
  const pick = (kind: ReadyKind) =>
    onChange({ kind, value: kind === value.kind ? value.value : "", timeout: value.timeout });
  const error = readyDraftError(value, servicePort);
  const portPlaceholder = servicePort > 0 ? `${servicePort} (this service's port)` : "Port to check";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">Ready when</span>
        <span className="text-right text-[12px] text-[var(--text-muted)]">
          {value.kind === "" ? "Counts as ready as soon as it starts." : waitersText(dependents)}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
        <ModeButton active={value.kind === ""} icon={<XIcon />} title="Started" onClick={() => pick("")} />
        <ModeButton active={value.kind === "port"} icon={<PortForwardIcon />} title="Port open" onClick={() => pick("port")} />
        <ModeButton active={value.kind === "url"} icon={<GlobeIcon />} title="URL answers" onClick={() => pick("url")} />
        <ModeButton active={value.kind === "log"} icon={<TerminalIcon />} title="Log line" onClick={() => pick("log")} />
      </div>
      {value.kind !== "" && (
        <div className="mt-3 flex items-center gap-2">
          <input
            aria-label={value.kind === "port" ? "Port to check" : value.kind === "url" ? "URL" : "Text to wait for"}
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
            placeholder={value.kind === "port" ? portPlaceholder : PLACEHOLDER[value.kind]}
            inputMode={value.kind === "port" ? "numeric" : undefined}
            spellCheck={false}
            autoComplete="off"
            className={`${fieldClass} min-w-0 flex-1 ${value.kind === "port" ? "" : "font-mono text-[12px]"}`}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
            <input
              aria-label="Timeout in seconds"
              value={value.timeout}
              onChange={(e) => onChange({ ...value, timeout: e.target.value })}
              placeholder="30"
              inputMode="numeric"
              className={`${fieldClass} w-[64px] text-center`}
            />
            s
          </label>
        </div>
      )}
      <span
        className={`mt-1.5 block text-[11px] ${error ? "text-[var(--accent-red)]" : "text-[var(--text-muted)]"}`}
      >
        {error ??
          (value.kind === "log"
            ? "Waits for a line of its output that contains this text."
            : value.kind !== ""
              ? "After the timeout its tab says it isn't ready, and what waits for it starts anyway."
              : "")}
      </span>
    </div>
  );
}
