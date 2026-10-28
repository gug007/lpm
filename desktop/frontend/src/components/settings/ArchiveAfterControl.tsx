import { useEffect, useState } from "react";
import {
  ARCHIVE_AMOUNT_MAX,
  ARCHIVE_UNITS,
  DEFAULT_ARCHIVE_AFTER,
  formatArchiveAfter,
  parseArchiveAfter,
  type ArchiveAfter,
  type ArchiveUnit,
} from "../../archiveAfter";
import { SettingsSelect } from "../SettingsSelect";

const UNIT_LABEL: Record<ArchiveUnit, [one: string, many: string]> = {
  m: ["minute", "minutes"],
  h: ["hour", "hours"],
  d: ["day", "days"],
  w: ["week", "weeks"],
};

const NEVER = "never";

const DISABLED_CLASS = "disabled:cursor-not-allowed disabled:opacity-50";

interface ArchiveAfterControlProps {
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}

/** "After [3] [days]", or "Never": how long a seen agent stays in the sidebar. */
export function ArchiveAfterControl({ value, disabled, onChange }: ArchiveAfterControlProps) {
  const parsed = parseArchiveAfter(value ?? DEFAULT_ARCHIVE_AFTER) ?? parseArchiveAfter(DEFAULT_ARCHIVE_AFTER);
  const after: ArchiveAfter | null = parsed === "never" ? null : parsed;
  const [draft, setDraft] = useState(String(after?.amount ?? 1));
  useEffect(() => setDraft(String(after?.amount ?? 1)), [after?.amount]);

  const commitAmount = () => {
    const amount = Number(draft);
    if (!after || !Number.isInteger(amount) || amount < 1 || amount > ARCHIVE_AMOUNT_MAX) {
      setDraft(String(after?.amount ?? 1));
      return;
    }
    if (amount !== after.amount) onChange(formatArchiveAfter({ ...after, amount }));
  };

  const pickUnit = (picked: string) => {
    if (picked === NEVER) return onChange(NEVER);
    onChange(formatArchiveAfter({ amount: after?.amount ?? 1, unit: picked as ArchiveUnit }));
  };

  const plural = (after?.amount ?? 1) === 1 ? 0 : 1;
  return (
    <div className="flex items-center gap-2">
      {after && (
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={ARCHIVE_AMOUNT_MAX}
          value={draft}
          disabled={disabled}
          aria-label="Archive after how many"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={`w-14 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[var(--text-muted)] focus-visible:border-[var(--accent-green)] focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/30 ${DISABLED_CLASS}`}
        />
      )}
      <SettingsSelect
        aria-label="Archive seen agents automatically"
        value={after ? after.unit : NEVER}
        disabled={disabled}
        className={DISABLED_CLASS}
        onChange={(e) => pickUnit(e.target.value)}
      >
        {ARCHIVE_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {UNIT_LABEL[unit][plural]}
          </option>
        ))}
        <option value={NEVER}>Never</option>
      </SettingsSelect>
    </div>
  );
}
