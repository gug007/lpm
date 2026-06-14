import { HelpCircleIcon, StopIcon, ZapIcon } from "../icons";
import { ModeButton } from "./ModeButton";

// `portConflict` uses "" as the unset/picker value and "ask" as the equivalent
// stored default. These two helpers own that convention so callers never
// special-case it.
export function toPickerValue(stored?: string): string {
  return stored && stored !== "ask" ? stored : "";
}

export function isExplicitPolicy(value: string): value is "free" | "fail" {
  return value === "free" || value === "fail";
}

interface PortConflictPickerProps {
  value: string;
  onChange: (value: string) => void;
  // "run" for actions, "start" for services — tunes the labels/hints.
  verb?: "run" | "start";
}

export function PortConflictPicker({
  value,
  onChange,
  verb = "run",
}: PortConflictPickerProps) {
  const current = value || "ask";
  const gerund = verb === "start" ? "starting" : "running";
  const hint =
    current === "free"
      ? `Frees the port automatically before ${gerund}.`
      : current === "fail"
        ? `Won’t ${verb} while the port is in use.`
        : "Asks before freeing the port.";
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">
          When the port is busy?
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">{hint}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
        <ModeButton
          active={current === "ask"}
          icon={<HelpCircleIcon />}
          title="Ask"
          onClick={() => onChange("")}
        />
        <ModeButton
          active={current === "free"}
          icon={<ZapIcon />}
          title="Free it"
          onClick={() => onChange("free")}
        />
        <ModeButton
          active={current === "fail"}
          icon={<StopIcon />}
          title={verb === "start" ? "Don’t start" : "Don’t run"}
          onClick={() => onChange("fail")}
        />
      </div>
    </div>
  );
}
