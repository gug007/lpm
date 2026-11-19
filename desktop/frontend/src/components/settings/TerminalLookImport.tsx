import { toast } from "../../notifications/toast";
import type { Settings } from "../../store/settings";
import type { TerminalThemeChoice } from "../../terminalThemeChoice";
import { lookPatch, lookSummary, previousOf, resolveFontFamily } from "../../terminalLooks";
import type { TerminalLook } from "./machineCommands";
import { TerminalLookSwatches } from "./TerminalLookSwatches";
import { useMachineList } from "./useMachineList";

interface TerminalLookImportProps {
  load: () => Promise<TerminalLook[]>;
  fonts: readonly string[];
  settings: Settings;
  choice: TerminalThemeChoice;
  update: (patch: Partial<Settings>) => Promise<void>;
}

// At the top of Settings › Terminal: the terminals on this computer with a
// look of their own, each a click from being this one's too.
export function TerminalLookImport({ load, fonts, settings, choice, update }: TerminalLookImportProps) {
  const looks = useMachineList(load);

  if (looks.length === 0) return null;

  const use = (look: TerminalLook) => {
    const patch = lookPatch(look, fonts, choice);
    const previous = previousOf(patch, settings);
    void update(patch).then(() =>
      toast.success(`Terminals now use ${look.app}'s look`, {
        action: { label: "Undo", onClick: () => void update(previous) },
      }),
    );
  };

  return (
    <div data-settings-row="terminal.importLook" className="border-b border-[var(--border)] px-4 py-3">
      <p className="text-[13px] font-medium text-[var(--text-primary)]">Use the look of a terminal you already have</p>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
        Its font, size and colors come across. Nothing in the other app changes.
      </p>
      <div className="mt-2.5 flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {looks.map((look) => {
          const family = resolveFontFamily(look.fontFamily, fonts);
          const missingFont = !!look.fontFamily && !family;
          return (
            <div key={look.app} className="flex items-center gap-3 px-3 py-2">
              <span className="w-[112px] shrink-0 truncate text-[12.5px] font-medium text-[var(--text-primary)]">
                {look.app}
              </span>
              <TerminalLookSwatches look={look} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]" title={lookSummary(look, family)}>
                {lookSummary(look, family)}
                {missingFont && <span className="text-[var(--text-muted)]"> · font not installed here</span>}
              </span>
              <button
                type="button"
                onClick={() => use(look)}
                className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Use this look
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
