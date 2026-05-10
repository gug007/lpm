import { useCallback } from "react";
import { ReadTemplate, SaveTemplate } from "../../wailsjs/go/main/App";
import { TEMPLATE_MODEL_URI } from "../monaco-setup";
import { YamlConfigEditor } from "./YamlConfigEditor";

export function TemplateEditor({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const load = useCallback(() => ReadTemplate(name), [name]);
  const save = useCallback(
    (content: string) => SaveTemplate(name, content),
    [name],
  );

  return (
    <YamlConfigEditor
      title={`Template · ${name}`}
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
      onBack={onBack}
    />
  );
}
