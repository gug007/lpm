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
          Reusable services, actions, and profiles. Reference from any project
          with <code className="font-mono">extends: [{name}]</code>.
        </>
      }
      modelUri={TEMPLATE_MODEL_URI}
      load={load}
      save={save}
      onBack={onBack}
    />
  );
}
