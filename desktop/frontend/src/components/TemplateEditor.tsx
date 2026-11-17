import { LayoutTemplate } from "lucide-react";
import { useCallback } from "react";
import { TEMPLATE_MODEL_URI } from "../monaco-uris";
import type { MachineScope } from "./settings/machineCommands";
import { YamlConfigEditor } from "./YamlConfigEditor";

export function TemplateEditor({
  name,
  machine,
  onBack,
  backTitle,
}: {
  name: string;
  machine: MachineScope;
  onBack: () => void;
  backTitle?: string;
}) {
  const { templates } = machine.commands;
  const load = useCallback(() => templates.read(name), [templates, name]);
  const save = useCallback(
    (content: string) => templates.save(name, content),
    [templates, name],
  );

  return (
    <YamlConfigEditor
      icon={LayoutTemplate}
      title={machine.name ? `Template · ${name} · ${machine.name}` : `Template · ${name}`}
      description={
        <>
          Services, actions and profiles to reuse. Add it to a project's config
          with{" "}
          <code className="whitespace-nowrap rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
            extends: [{name}]
          </code>
        </>
      }
      placeholder="services:  # what every project that extends this template gets"
      modelUri={TEMPLATE_MODEL_URI}
      load={load}
      save={save}
      draftKey={`template:${machine.name ?? ""}:${name}`}
      onBack={onBack}
      backTitle={backTitle}
    />
  );
}
