// Migration codegen: reads the Wails v3 generated bindings and emits
//   1. wailsjs/go/main/App.js  — a Tauri-backed shim (invoke() per command)
//   2. src-tauri/src/generated_commands.rs — stub #[tauri::command] fns + handler list
//
// The frontend's 56 component files import command functions from
// wailsjs/go/main/App by their original PascalCase names, so the shim keeps
// those exact export names; each forwards to a snake_case Tauri command.
//
// Commands listed in REAL are implemented by hand (src/commands_real.rs) and
// are therefore omitted from the generated stub bodies, but still included in
// the handler list. Re-run after the Wails bindings change:
//   node scripts/gen-tauri-bindings.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BINDINGS = "bindings/github.com/gug007/lpm/desktop/app.js";
const APP_SHIM = "wailsjs/go/main/App.js";
const RUST_OUT = "src-tauri/src/generated_commands.rs";

// Hand-implemented commands (in src/commands_real.rs). Omitted from stubs.
const REAL = new Set([
  "GetVersion",
  "GetPlatform",
  "LoadSettings",
  "ListProjects",
  "TmuxInstalled",
  "GetProject",
  "SaveSettings",
  "SaveWindowSize",
  "ReorderProjects",
  "SetProjectLabel",
  "LoadTerminals",
  "SaveTerminals",
  // Project CRUD (projects_crud.rs)
  "CreateProject",
  "CreateSSHProject",
  "CreateProjectFromClone",
  "DuplicateProject",
  "RemoveProject",
  // Detached windows (detached.rs)
  "DetachProject",
  "AttachProject",
  "ListDetachedProjects",
  "FocusDetachedWindow",
  "RestoreDetachedWindows",
  // PTY (pty.rs)
  "StartTerminal",
  "StartTerminalWithCwdEnv",
  "StartTerminalForConfig",
  "StartTerminalForRestore",
  "WriteTerminal",
  "ResizeTerminal",
  "AckTerminalData",
  "StopTerminal",
  "IsTerminalRemote",
  // Services / tmux (services.rs)
  "StartProject",
  "StartProjectWithServices",
  "StopProject",
  "StopAll",
  "ToggleProjectService",
  "StartService",
  "StopService",
  // Log streaming (log_streaming.rs)
  "GetServiceLogs",
  "StartLogStreaming",
  "StopLogStreaming",
  // Git (git.rs)
  "GitStatus", "GitChangedFiles", "GitDiff", "GitDiffBranch", "GitDiscardFiles",
  "GitDiscardAll", "ListBranches", "SearchBranches", "CheckoutBranch", "CreateBranch",
  "DeleteBranch", "RenameBranch", "GitDefaultBranch", "GitLogBranch", "GitCommitCount",
  "GitCommit", "GitPush", "GitFetchAll", "GitMerge", "GitMergeConflicts", "GitAbortMerge",
  "PullBranch", "SyncBranch", "CheckGHCLI", "CreatePullRequest",
  // File watcher (git.rs)
  "StartWatchingProject", "StopWatchingProject",
  // Config R/W (config_cmds.rs)
  "ReadConfig", "SaveConfig", "ReadGlobalConfig", "SaveGlobalConfig",
  "ReadRepoConfig", "SaveRepoConfig",
  // File ops + dialog (files.rs)
  "BrowseFolder", "FileExists", "ReadFile", "WriteFile", "OpenPathInDefaultApp",
  // Open-in (openin.rs)
  "ListOpenInTargets", "OpenIn", "OpenFileInEditor",
  // Templates + AI instructions (templates.rs)
  "ListTemplates", "ReadTemplate", "SaveTemplate", "CreateTemplate",
  "DeleteTemplate", "RenameTemplate",
  "ReadCommitInstructions", "SaveCommitInstructions",
  "ReadPRTitleInstructions", "SavePRTitleInstructions",
  "ReadPRDescriptionInstructions", "SavePRDescriptionInstructions",
  "ReadBranchNameInstructions", "SaveBranchNameInstructions",
  // AI generation (aigen.rs)
  "CheckAICLIs", "GenerateCommitMessage", "GeneratePRTitle", "GeneratePRDescription",
  "GenerateBranchName", "ResolveMergeConflictsWithAI", "GenerateActionYAML",
  "GenerateProjectConfig",
  // Port-conflict checks (ports.rs)
  "CheckPortConflicts", "CheckPortConflictsForServices", "CheckActionPortConflict",
  "ResolvePortConflict",
  // SSH port forwarding + suggestions (portforward.rs) — poller/sniff/auto-forward deferred
  "AddPortForward", "RemovePortForward", "ListPortForwards",
  "GetSuggestedPorts", "ClearPortSuggestions", "DismissPortSuggestion",
  // SSH host discovery (sshconfig.rs)
  "ListSSHHosts",
  // Notes + vault (notes_cmds.rs / notes_store.rs / notes_blobs.rs / vault.rs)
  "NotesCreateChat", "NotesListChats", "NotesRenameChat", "NotesDeleteChat",
  "NotesAddMessage", "NotesListMessages", "NotesEditMessage", "NotesDeleteMessage",
  "NotesSearch", "NotesReadAttachment", "NotesSaveAttachment", "NotesReadFileAsInput",
  "VaultExportKey", "VaultImportKey",
  // Actions (actions.rs) + status socket (status.rs)
  "RunAction", "RunActionBackground", "ClearStatus",
  // Agent status hooks (hooks.rs)
  "CheckClaudeHooks", "ResetClaudeHooks",
  // Config transfer (transfer.rs), clipboard (clipboard.rs), upload (upload.rs)
  "ExportConfig", "ImportConfig",
  "ReadClipboardFiles", "SaveClipboardImage",
  "UploadAndQuoteForTerminal", "UploadClipboardImageForTerminal",
  // Self-updater + tmux install (updates.rs)
  "CheckForUpdate", "InstallUpdate", "InstallTmux",
  // TTS (tts.rs)
  "StartTTS", "StopTTS", "PauseTTS", "ResumeTTS",
  "CheckKokoroInstalled", "InstallKokoro", "UninstallKokoro",
]);

// Self-consistent PascalCase -> snake_case. Only needs to agree between the
// JS invoke() string and the Rust fn name (we own both sides), so the exact
// acronym handling is irrelevant as long as it is deterministic.
function snake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

// Tauri's #[command] (default rename_all = "camelCase") resolves each JS arg by
// `to_lower_camel_case(rust_param_name)` (tauri-macros wrapper.rs). Our Rust
// params are the snake_case form below, so the invoke() key MUST be the
// lowerCamelCase of that snake form — NOT the raw Wails identifier. They differ
// only for acronym params (chatID -> chatId, beforeID -> beforeId,
// currentYAML -> currentYaml); for everything else the two are identical.
function lowerCamelKey(param) {
  return snake(param).replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// Map a binding's JSDoc return type to a crash-safe empty JSON value. The app
// has no React error boundaries, so a stub returning null where a component
// does `.filter`/`.map`/`.split` during render unmounts the whole tree. Arrays
// -> [], string -> "", bool -> false, number -> 0 covers most; objects/void/
// unions stay null (truthful "unimplemented") and get real impls as needed.
function emptyValueFor(ret) {
  const t = (ret || "").trim();
  if (t.endsWith("[]")) return "serde_json::json!([])";
  if (t === "string") return 'serde_json::json!("")';
  if (t === "boolean") return "serde_json::json!(false)";
  if (t === "number") return "serde_json::json!(0)";
  return "Value::Null";
}

const src = readFileSync(BINDINGS, "utf8");
const re = /export function (\w+)\(([^)]*)\)/g;
const cmds = [];
let m;
while ((m = re.exec(src)) !== null) {
  const name = m[1];
  const params = m[2]
    .split(",")
    .map((p) => p.trim())
    // Wails escapes JS-reserved-ish param names with a leading `$` (e.g.
    // `$from`). Strip it so the invoke key matches the snake_case Rust param.
    .map((p) => p.replace(/^\$/, ""))
    .filter(Boolean);
  // Nearest preceding `@returns {$CancellablePromise<RET>}` in the JSDoc block.
  const before = src.slice(Math.max(0, m.index - 600), m.index);
  const rets = [...before.matchAll(/@returns \{\$CancellablePromise<([\s\S]*?)>\}/g)];
  const ret = rets.length ? rets[rets.length - 1][1].trim() : "";
  cmds.push({ name, snake: snake(name), params, ret });
}
cmds.sort((a, b) => a.name.localeCompare(b.name));

// --- 1. JS shim ---------------------------------------------------------
const jsHeader = `// AUTO-GENERATED by scripts/gen-tauri-bindings.mjs — DO NOT EDIT BY HAND.
// Tauri-backed replacement for the Wails v3 command bindings. Each export keeps
// its original PascalCase name (imported across 56 component files) and forwards
// to a snake_case Tauri command via invoke(). camelCase arg keys are converted
// to Rust snake_case parameters automatically by Tauri.
import { invoke } from "@tauri-apps/api/core";
`;
const jsBody = cmds
  .map(({ name, snake, params }) => {
    // Map each positional param to its Tauri-expected camelCase invoke key,
    // using object shorthand when the key already equals the param name.
    const entries = params.map((p) => {
      const key = lowerCamelKey(p);
      return key === p ? p : `${key}: ${p}`;
    });
    const args = entries.length ? `, { ${entries.join(", ")} }` : "";
    return `export function ${name}(${params.join(", ")}) {\n  return invoke("${snake}"${args});\n}`;
  })
  .join("\n");
mkdirSync(dirname(APP_SHIM), { recursive: true });
writeFileSync(APP_SHIM, jsHeader + "\n" + jsBody + "\n");

// --- 2. Rust stubs ------------------------------------------------------
const rustHeader = `// AUTO-GENERATED by scripts/gen-tauri-bindings.mjs — DO NOT EDIT BY HAND.
// Stub command handlers for the Wails->Tauri migration. Each returns a crash-
// safe empty value derived from the binding's return type (arrays -> [], etc.)
// until ported. Commands implemented in commands_real.rs are excluded here but
// still appear in the handler list (handler!() macro below).
#![allow(clippy::unused_async)]
#[allow(unused_imports)]
use serde_json::Value;
`;
const stubs = cmds
  .filter((c) => !REAL.has(c.name))
  .map(
    (c) =>
      `#[tauri::command]\npub async fn ${c.snake}() -> Result<Value, String> {\n    Ok(${emptyValueFor(c.ret)})\n}`,
  )
  .join("\n\n");

// handler!() expands to the full list, mixing real + stub fns. The invoking
// crate brings both modules into scope, so unqualified names resolve.
const handlerList = cmds.map((c) => `        ${c.snake}`).join(",\n");
const macro = `\n/// All ${cmds.length} commands (real + stub) for tauri::generate_handler!.\n#[macro_export]\nmacro_rules! all_command_handlers {\n    () => {\n        tauri::generate_handler![\n${handlerList}\n        ]\n    };\n}\n`;

mkdirSync(dirname(RUST_OUT), { recursive: true });
writeFileSync(RUST_OUT, rustHeader + "\n" + stubs + "\n" + macro);

console.log(`Generated ${cmds.length} commands:`);
console.log(`  ${APP_SHIM}`);
console.log(`  ${RUST_OUT}`);
console.log(`  (${REAL.size} real, ${cmds.length - REAL.size} stubbed)`);
