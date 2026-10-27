import { useCallback } from "react";
import { TEMPLATE_MODEL_URI } from "../monaco-setup";
import type { MachineScope } from "./settings/machineCommands";
import { YamlConfigEditor } from "./YamlConfigEditor";

export function TemplateEditor({
  name,
  machine,
  onBack,
}: {
  name: string;
  machine: MachineScope;
  onBack: () => void;
}) {
  const { templates } = machine.commands;
  const load = useCallback(() => templates.read(name), [templates, name]);
  const save = useCallback(
    (content: string) => templates.save(name, content),
    [templates, name],
  );

  return (
    <YamlConfigEditor
      title={machine.name ? `Template · ${name} · ${machine.name}` : `Template · ${name}`}
      description={
        <>
          A reusable bundle of services, actions, and profiles. Add to any
          project's config to use:{" "}
          <code className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-primary)]">
            extends: [{name}]
          </code>
        </>
      }
      modelUri={TEMPLATE_MODEL_URI}
      load={load}
      save={save}
      draftKey={`template:${machine.name ?? ""}:${name}`}
      onBack={onBack}
    />
  );
}
