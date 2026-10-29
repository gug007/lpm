// Settings › Agents › Archive seen agents after: "never", or an amount
// from 1 to 999 and a unit, as in "90m" or "2d" — the form status/seen.rs reads.

export const ARCHIVE_UNITS = ["m", "h", "d", "w"] as const;
export type ArchiveUnit = (typeof ARCHIVE_UNITS)[number];

export interface ArchiveAfter {
  amount: number;
  unit: ArchiveUnit;
}

export const DEFAULT_ARCHIVE_AFTER = "1d";
export const ARCHIVE_AMOUNT_MAX = 999;

const PATTERN = /^([1-9]\d{0,2})([mhdw])$/;

/** "never" as itself, a length as its amount and unit, anything else as null. */
export function parseArchiveAfter(value: string): ArchiveAfter | "never" | null {
  if (value === "never") return "never";
  const match = PATTERN.exec(value);
  return match ? { amount: Number(match[1]), unit: match[2] as ArchiveUnit } : null;
}

export function formatArchiveAfter({ amount, unit }: ArchiveAfter): string {
  return `${amount}${unit}`;
}

export function isArchiveAfter(value: unknown): value is string {
  return typeof value === "string" && parseArchiveAfter(value) !== null;
}
