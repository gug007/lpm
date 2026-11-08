import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import YamlWorker from "./yaml.worker?worker";
import { configureMonacoYaml } from "monaco-yaml";
import "./styles/monaco-overrides.css";

import projectSchema from "./schemas/project-config.schema.json";
import globalSchema from "./schemas/global-config.schema.json";
import repoSchema from "./schemas/repo-config.schema.json";
import { templateSchema } from "./schemas/templateSchema";
import { markMonacoLoaded } from "./monaco-loaded";
import {
  ACTION_MODEL_URI,
  ACTION_SCHEMA_URI,
  GLOBAL_MODEL_URI,
  GLOBAL_SCHEMA_URI,
  PROJECT_MODEL_URI,
  PROJECT_SCHEMA_URI,
  REPO_MODEL_URI,
  REPO_SCHEMA_URI,
  TEMPLATE_MODEL_URI,
  TEMPLATE_SCHEMA_URI,
} from "./monaco-uris";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

type WorkerLabel = string;

let configured = false;

export function setupMonaco(): typeof monaco {
  if (configured) return monaco;
  configured = true;
  markMonacoLoaded(monaco);

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
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(tsDiagnostics);
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(tsDiagnostics);

  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    hover: true,
    completion: true,
    validate: true,
    format: { enable: true },
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
        fileMatch: [REPO_MODEL_URI],
        schema: repoSchema as object,
      },
      {
        uri: TEMPLATE_SCHEMA_URI,
        // Templates share the RepoConfig shapes, but hold only actions and terminals.
        fileMatch: [TEMPLATE_MODEL_URI],
        schema: templateSchema as object,
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
