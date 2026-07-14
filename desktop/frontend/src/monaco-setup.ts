import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import YamlWorker from "./yaml.worker?worker";
import { configureMonacoYaml } from "monaco-yaml";

import projectSchema from "./schemas/project-config.schema.json";
import globalSchema from "./schemas/global-config.schema.json";
import repoSchema from "./schemas/repo-config.schema.json";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

type WorkerLabel = string;

export const PROJECT_SCHEMA_URI = "lpm://schemas/project-config.json";
export const GLOBAL_SCHEMA_URI = "lpm://schemas/global-config.json";
export const REPO_SCHEMA_URI = "lpm://schemas/repo-config.json";
export const ACTION_SCHEMA_URI = "lpm://schemas/action.json";
export const PROJECT_MODEL_URI = "inmemory://lpm/project.yml";
export const GLOBAL_MODEL_URI = "inmemory://lpm/global.yml";
export const REPO_MODEL_URI = "inmemory://lpm/repo.yml";
export const TEMPLATE_MODEL_URI = "inmemory://lpm/template.yml";
// The action wizard editor validates a single action mapping, not a whole
// config. A fixed model URI (exact fileMatch, like the entries above) keeps
// matching deterministic; the wizard forces a fresh editor via its React key.
export const ACTION_MODEL_URI = "inmemory://lpm/action.yml";

let configured = false;

export function setupMonaco(): typeof monaco {
  if (configured) return monaco;
  configured = true;

  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: WorkerLabel) {
      if (label === "yaml") return new YamlWorker();
      if (label === "typescript" || label === "javascript") return new TsWorker();
      return new EditorWorker();
    },
  };

  // The diff review models get .ts/.tsx URIs, so Monaco spins up the TypeScript
  // language worker for validation — but only the editor + yaml workers are wired
  // up here, so that worker throws (moduleIdToUrl.toUrl). We only need
  // colorization, not IntelliSense/diagnostics, so turn validation off.
  const tsDiagnostics = {
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  };
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(tsDiagnostics);
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(tsDiagnostics);

  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    hover: true,
    completion: true,
    validate: true,
    format: true,
    schemas: [
      {
        uri: PROJECT_SCHEMA_URI,
        fileMatch: [PROJECT_MODEL_URI],
        schema: projectSchema as object,
      },
      {
        uri: GLOBAL_SCHEMA_URI,
        fileMatch: [GLOBAL_MODEL_URI],
        schema: globalSchema as object,
      },
      {
        uri: REPO_SCHEMA_URI,
        // Templates share the RepoConfig shape, so the same schema covers
        // both file types — Monaco picks it up via two model URIs.
        fileMatch: [REPO_MODEL_URI, TEMPLATE_MODEL_URI],
        schema: repoSchema as object,
      },
      {
        uri: ACTION_SCHEMA_URI,
        fileMatch: [ACTION_MODEL_URI],
        // The action wizard edits a single action mapping. The `action`
        // definition $refs siblings (actionInput/envMap), so the whole
        // definitions map rides along for those references to resolve.
        schema: {
          $ref: "#/definitions/action",
          definitions: projectSchema.definitions,
        },
      },
    ],
  });

  return monaco;
}
