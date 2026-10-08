import { useSettingsStore } from "../../store/settings";
import { rowProps } from "../../settings-registry";
import { Group, Row } from "./GroupedList";
import { Toggle } from "./Toggle";

// A host never updates itself, so without this every release of this app leaves
// each one behind until someone presses Update on it.
export function HostAutoUpdateRow() {
  const enabled = useSettingsStore((s) => s.autoUpdateHosts ?? true);
  const update = useSettingsStore((s) => s.update);
  const row = rowProps("connections.hostUpdates");

  return (
    <div className="mt-3" data-settings-row={row.id}>
      <Group>
        <Row>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{row.label}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
              {row.description}
            </p>
          </div>
          <Toggle
            enabled={enabled}
            ariaLabel={row.label}
            onChange={(v) => void update({ autoUpdateHosts: v })}
          />
        </Row>
      </Group>
    </div>
  );
}
