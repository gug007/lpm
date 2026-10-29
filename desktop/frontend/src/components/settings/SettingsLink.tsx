import type { ReactNode } from "react";
import type { SettingsRowId } from "../../settings-registry";
import { useAppStore, type SettingsTab } from "../../store/app";
import { revealSettingsRow } from "./revealSettingsRow";

// A link in a Settings page's text to a row on another page, for the same machine.
export function SettingsLink({ tab, row, children }: { tab: SettingsTab; row: SettingsRowId; children: ReactNode }) {
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  return (
    <button
      type="button"
      onClick={() => {
        setSettingsTab(tab);
        revealSettingsRow(row);
      }}
      className="font-medium text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:decoration-current"
    >
      {children}
    </button>
  );
}
