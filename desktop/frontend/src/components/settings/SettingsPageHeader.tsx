import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../ui/PageHeader";

export function SettingsPageHeader({
  icon,
  title,
  description,
  machineName,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /// The connected machine these settings are saved on; unset for this one.
  machineName?: string;
}) {
  return (
    <PageHeader
      icon={icon}
      title={title}
      description={description}
      badge={
        machineName && (
          <span
            className="truncate rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
            title={`Saved on ${machineName}`}
          >
            {machineName}
          </span>
        )
      }
    />
  );
}
