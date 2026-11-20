import { useEffect, useState } from "react";
import { count, money, type GenerateUsage } from "../../generate";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { useSettingsTarget } from "./settingsTarget";

// What agents made through lpm this month, and what it cost.
export function GenerateUsageRow() {
  const { commands } = useSettingsTarget();
  const [usage, setUsage] = useState<GenerateUsage | null>(null);

  useEffect(() => {
    commands.generate
      .usage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [commands]);

  const row = rowProps("generate.usage");
  const made = usage
    ? usage.images + usage.clips === 0
      ? "Nothing yet"
      : [
          usage.images > 0 ? count(usage.images, "image", "images") : "",
          usage.clips > 0 ? count(usage.clips, "clip", "clips") : "",
        ]
          .filter(Boolean)
          .join(" · ")
    : "…";

  return (
    <SettingsRow id={row.id} label={`${row.label}: ${made}`} description={row.description}>
      {usage && usage.cents > 0 ? (
        <span className="text-sm font-medium tabular-nums text-[var(--text-primary)]">{money(usage.cents)}</span>
      ) : null}
    </SettingsRow>
  );
}
