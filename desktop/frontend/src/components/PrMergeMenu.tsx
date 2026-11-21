import { Check } from "lucide-react";
import { count } from "../count";
import { MERGE_METHOD_LABEL, waitText, type MergeMode, type MergeStatus } from "../prMerge";
import type { PrMergeMethod } from "../types";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";

const HEADING = "px-3 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]";

const tick = (on: boolean) => <Check size={11} className={on ? "" : "opacity-0"} />;

/** The merge button's arrow menu: when to merge while checks run, how, and
 *  GitHub's "Bypass requirements" for someone allowed to. */
export function PrMergeMenu({
  status,
  mode,
  method,
  methods,
  running,
  base,
  onMode,
  onMethod,
}: {
  status: MergeStatus;
  mode: MergeMode | null;
  method: PrMergeMethod;
  methods: PrMergeMethod[];
  running: number;
  base: string;
  onMode: (mode: MergeMode | null) => void;
  onMethod: (method: PrMergeMethod) => void;
}) {
  return (
    <div role="menu" className="mt-1.5 overflow-hidden rounded-md border border-[var(--border)] py-0.5">
      {status.wait && (
        <>
          <div className={HEADING}>When</div>
          <ContextMenuItem
            checked={mode === "wait"}
            icon={tick(mode === "wait")}
            label="When checks pass"
            description={waitText(running, status.bypass, base)}
            onClick={() => onMode("wait")}
          />
          {status.now && (
            <ContextMenuItem
              checked={mode === "now"}
              icon={tick(mode === "now")}
              label="Now"
              description={`Without waiting for the ${count(running, "running check", "running checks")}`}
              onClick={() => onMode("now")}
            />
          )}
          <ContextMenuSeparator />
          <div className={HEADING}>How</div>
        </>
      )}
      {methods.map((m) => (
        <ContextMenuItem
          key={m}
          checked={m === method}
          icon={tick(m === method)}
          label={MERGE_METHOD_LABEL[m]}
          onClick={() => onMethod(m)}
        />
      ))}
      {status.bypass && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            destructive
            checked={mode === "bypass"}
            icon={tick(mode === "bypass")}
            label="Bypass requirements"
            description={`${MERGE_METHOD_LABEL[method]} now, without waiting`}
            onClick={() => onMode(mode === "bypass" ? null : "bypass")}
          />
        </>
      )}
    </div>
  );
}
