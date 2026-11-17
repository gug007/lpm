import { ChevronRight } from "lucide-react";
import { useAccountsStore } from "../../store/accounts";
import { useAppStore } from "../../store/app";
import type { ConfigForm } from "../../visualConfigYaml";
import { ConfigField } from "./ConfigField";
import { ConfigSelect } from "./ConfigSelect";
import { TEXT_ACTION } from "../ui/buttons";

const INHERIT_OPTION = "__inherit__";
const MAIN_OPTION = "__main__";
const LIST_OPTION = "__list__";

// Which option the Claude account select shows for the project's own keys.
function claudeChoiceValue(form: ConfigForm): string {
  if (form.claudeAccount !== null) return form.claudeAccount;
  if (form.claudeAccounts?.length) return LIST_OPTION;
  if (form.claudeAccounts) return MAIN_OPTION;
  return form.parentName ? INHERIT_OPTION : MAIN_OPTION;
}

function claudeChoicePatch(value: string, form: ConfigForm): Partial<ConfigForm> {
  if (value === LIST_OPTION) return {};
  if (value === INHERIT_OPTION) return { claudeAccount: null, claudeAccounts: null };
  if (value === MAIN_OPTION) return { claudeAccount: null, claudeAccounts: form.parentName ? [] : null };
  return { claudeAccount: value, claudeAccounts: null };
}

export function ClaudeAccountField({ form, onChange }: { form: ConfigForm; onChange: (patch: Partial<ConfigForm>) => void }) {
  const accounts = useAccountsStore((s) => s.accounts);
  const accountStatuses = useAccountsStore((s) => s.statuses);
  const openSettingsTab = useAppStore((s) => s.openSettingsTab);
  const openAccountSettings = () => openSettingsTab("accounts");
  const removed = Boolean(form.claudeAccount) && !accounts.some((a) => a.id === form.claudeAccount);

  return (
    <div className="min-w-0">
      <ConfigField label="Claude account">
        <ConfigSelect
          value={claudeChoiceValue(form)}
          onChange={(v) => onChange(claudeChoicePatch(v, form))}
          invalid={removed}
          options={[
            ...(form.parentName ? [{ value: INHERIT_OPTION, label: "Inherit from parent" }] : []),
            // With no account added yet the main pool is the main login alone.
            { value: MAIN_OPTION, label: accounts.length === 0 ? "Main account" : "Main accounts" },
            ...(form.claudeAccounts?.length ? [{ value: LIST_OPTION, label: "Own list (set in the project menu)" }] : []),
            { value: "", label: "Main login only" },
            ...accounts.map((a) => {
              const email = accountStatuses[a.id]?.email;
              return { value: a.id, label: email ? `${a.label} — ${email}` : a.label };
            }),
            ...(removed && form.claudeAccount ? [{ value: form.claudeAccount, label: "Removed account" }] : []),
          ]}
        />
      </ConfigField>
      <button type="button" onClick={openAccountSettings} className={`-ml-1.5 mt-1 ${TEXT_ACTION}`}>
        Manage accounts
        <ChevronRight size={12} strokeWidth={2} className="-mr-0.5" />
      </button>
    </div>
  );
}
