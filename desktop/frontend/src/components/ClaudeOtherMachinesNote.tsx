import { sharingMachines } from "../claudeMachines";
import { MACHINE } from "../machineWords";
import { useAppStore } from "../store/app";
import { useMachineClaudeStore } from "../store/machineClaude";
import { BTN_SECONDARY_SM } from "./ui/buttons";

/** Under this machine's Claude accounts while other computers are connected: a
 *  session there runs on that computer's accounts, which are one click away. */
export function ClaudeOtherMachinesNote() {
  const aliases = useMachineClaudeStore((s) => s.aliases);
  const machines = useMachineClaudeStore((s) => s.machines);
  const setSettingsMachine = useAppStore((s) => s.setSettingsMachine);

  const others = sharingMachines(aliases, machines);
  if (others.length === 0) return null;
  const only = others.length === 1 ? others[0].alias : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <p className="min-w-0 flex-[1_1_14rem] text-[11px] leading-relaxed text-[var(--text-secondary)]">
        These accounts are for sessions on {MACHINE.thisMachine}.{" "}
        {only
          ? `Sessions on ${only} use the accounts on ${only}.`
          : "Each connected computer uses its own accounts."}
      </p>
      <span className="flex flex-wrap gap-1.5">
        {others.map(({ slug, alias }) => (
          <button key={slug} type="button" className={BTN_SECONDARY_SM} onClick={() => setSettingsMachine(slug)}>
            {only ? `Accounts on ${alias}` : alias}
          </button>
        ))}
      </span>
    </div>
  );
}
