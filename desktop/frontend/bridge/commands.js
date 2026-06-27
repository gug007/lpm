// Command bindings. Each export keeps its PascalCase name (imported across the
// component files) and forwards to a snake_case Tauri command via invoke();
// camelCase arg keys map to Rust snake_case params.
//
// Maintained BY HAND. To add a command: add the #[tauri::command] fn in
// src-tauri/, list it in all_command_handlers! (generated_commands.rs), and add
// an `export function Name(...) { invoke(...) }` here with camelCase arg keys.
import { invoke } from "@tauri-apps/api/core";

export function AckTerminalData(id, charCount) {
  return invoke("ack_terminal_data", { id, charCount });
}
export function AddPortForward(project, remotePort, localPort) {
  return invoke("add_port_forward", { project, remotePort, localPort });
}
export function AttachProject(projectName) {
  return invoke("attach_project", { projectName });
}
export function BrowseFolder(defaultDir) {
  return invoke("browse_folder", { defaultDir });
}
export function CheckActionPortConflict(projectName, actionName) {
  return invoke("check_action_port_conflict", { projectName, actionName });
}
export function CheckAICLIs() {
  return invoke("check_aicl_is");
}
export function ListAgentCommands(cli, cwd) {
  return invoke("list_agent_commands", { cli, cwd });
}
export function CheckClaudeHooks() {
  return invoke("check_claude_hooks");
}
export function CheckForUpdate() {
  return invoke("check_for_update");
}
export function CheckGHCLI() {
  return invoke("check_ghcli");
}
export function CheckKokoroInstalled() {
  return invoke("check_kokoro_installed");
}
export function CheckoutBranch(cwd, branch, remote) {
  return invoke("checkout_branch", { cwd, branch, remote });
}
export function CheckPortConflicts(name, profile) {
  return invoke("check_port_conflicts", { name, profile });
}
export function CheckPortConflictsForServices(name, services) {
  return invoke("check_port_conflicts_for_services", { name, services });
}
export function ClearPortSuggestions(project) {
  return invoke("clear_port_suggestions", { project });
}
export function ClearStatus(project, paneID, value) {
  return invoke("clear_status", { project, paneId: paneID, value });
}
export function ClearPaneStatus(project, paneID) {
  return invoke("clear_pane_status", { project, paneId: paneID });
}
export function CreateBranch(cwd, name) {
  return invoke("create_branch", { cwd, name });
}
export function CreateProject(name, root) {
  return invoke("create_project", { name, root });
}
export function CreateProjectFromClone(name, url, branch, destParent) {
  return invoke("create_project_from_clone", { name, url, branch, destParent });
}
export function CreatePullRequest(cwd, title, body, base) {
  return invoke("create_pull_request", { cwd, title, body, base });
}
export function CreateSSHProject(name, ssh) {
  return invoke("create_ssh_project", { name, ssh });
}
export function CreateTemplate(name) {
  return invoke("create_template", { name });
}
export function DeleteBranch(cwd, name) {
  return invoke("delete_branch", { cwd, name });
}
export function DeleteTemplate(name) {
  return invoke("delete_template", { name });
}
export function DetachProject(projectName) {
  return invoke("detach_project", { projectName });
}
export function DismissPortSuggestion(project, port) {
  return invoke("dismiss_port_suggestion", { project, port });
}
export function DuplicateProject(name, label, excludeUncommitted, reinstallDeps, pullLatest) {
  return invoke("duplicate_project", { name, label, excludeUncommitted, reinstallDeps, pullLatest });
}
export function DuplicateProjects(name, count, excludeUncommitted, reinstallDeps, pullLatest) {
  return invoke("duplicate_projects", { name, count, excludeUncommitted, reinstallDeps, pullLatest });
}
export function ExportConfig() {
  return invoke("export_config");
}
export function FileExists(absPath) {
  return invoke("file_exists", { absPath });
}
export function ListDirFiles(root) {
  return invoke("list_dir_files", { root });
}
export function FocusDetachedWindow(projectName) {
  return invoke("focus_detached_window", { projectName });
}
export function FocusMainWindow(project, view, addProject) {
  return invoke("focus_main_window", { project, view, addProject });
}
export function GenerateActionYAML(projectName, cli, model, effort, fast, userPrompt, currentYAML) {
  return invoke("generate_action_yaml", { projectName, cli, model, effort, fast, userPrompt, currentYaml: currentYAML });
}
export function GenerateBranchName(projectName, cwd, cli, model, effort, fast) {
  return invoke("generate_branch_name", { projectName, cwd, cli, model, effort, fast });
}
export function GenerateCommitMessage(projectName, cwd, cli, model, effort, fast, files, taskDescription) {
  return invoke("generate_commit_message", { projectName, cwd, cli, model, effort, fast, files, taskDescription });
}
export function GeneratePRDescription(projectName, cwd, cli, model, effort, fast, base) {
  return invoke("generate_pr_description", { projectName, cwd, cli, model, effort, fast, base });
}
export function GenerateProjectConfig(projectName, cli, extraPrompt) {
  return invoke("generate_project_config", { projectName, cli, extraPrompt });
}
export function GeneratePRTitle(projectName, cwd, cli, model, effort, fast, base) {
  return invoke("generate_pr_title", { projectName, cwd, cli, model, effort, fast, base });
}
export function GetPlatform() {
  return invoke("get_platform");
}
export function GetProject(name) {
  return invoke("get_project", { name });
}
export function GetServiceLogs(projectName, paneIndex, lines) {
  return invoke("get_service_logs", { projectName, paneIndex, lines });
}
export function GetSuggestedPorts(project) {
  return invoke("get_suggested_ports", { project });
}
export function GetVersion() {
  return invoke("get_version");
}
export function GitAbortMerge(cwd) {
  return invoke("git_abort_merge", { cwd });
}
export function GitChangedFiles(cwd) {
  return invoke("git_changed_files", { cwd });
}
export function GitCommit(cwd, message, files) {
  return invoke("git_commit", { cwd, message, files });
}
export function GitCommitCount(cwd, from, to) {
  return invoke("git_commit_count", { cwd, from, to });
}
export function GitDefaultBranch(cwd) {
  return invoke("git_default_branch", { cwd });
}
export function GitDiff(cwd, files) {
  return invoke("git_diff", { cwd, files });
}
export function GitDiffBranch(cwd, base) {
  return invoke("git_diff_branch", { cwd, base });
}
export function GitFileDiff(cwd, path) {
  return invoke("git_file_diff", { cwd, path });
}
export function GitDiscardAll(cwd) {
  return invoke("git_discard_all", { cwd });
}
export function GitDiscardFiles(cwd, files) {
  return invoke("git_discard_files", { cwd, files });
}
export function GitFetchAll(cwd, flags) {
  return invoke("git_fetch_all", { cwd, flags });
}
export function GitLogBranch(cwd, base) {
  return invoke("git_log_branch", { cwd, base });
}
export function GitMerge(cwd, branch) {
  return invoke("git_merge", { cwd, branch });
}
export function GitMergeConflicts(cwd) {
  return invoke("git_merge_conflicts", { cwd });
}
export function GitPush(cwd, flags) {
  return invoke("git_push", { cwd, flags });
}
export function GitStatus(cwd) {
  return invoke("git_status", { cwd });
}
export function ImportConfig(overwrite) {
  return invoke("import_config", { overwrite });
}
export function InstallKokoro() {
  return invoke("install_kokoro");
}
export function InstallTmux() {
  return invoke("install_tmux");
}
export function InstallUpdate() {
  return invoke("install_update");
}
export function IsTerminalRemote(id) {
  return invoke("is_terminal_remote", { id });
}
export function ListBranches(cwd) {
  return invoke("list_branches", { cwd });
}
export function ListDetachedProjects() {
  return invoke("list_detached_projects");
}
export function ListOpenInTargets() {
  return invoke("list_open_in_targets");
}
export function ListPortForwards(project) {
  return invoke("list_port_forwards", { project });
}
export function ListProjects() {
  return invoke("list_projects");
}
export function ListSSHHosts() {
  return invoke("list_ssh_hosts");
}
export function ListSystemSounds() {
  return invoke("list_system_sounds");
}
export function ListTemplates() {
  return invoke("list_templates");
}
export function LoadGroups() {
  return invoke("load_groups");
}
export function LoadComposerActions() {
  return invoke("load_composer_actions");
}
export function SaveComposerActions(actions) {
  return invoke("save_composer_actions", { actions });
}
export function MessageHistoryQuery(input) {
  return invoke("message_history_query", { input });
}
export function MessageHistoryAdd(message) {
  return invoke("message_history_add", { message });
}
export function MessageHistoryToggleFavorite(id) {
  return invoke("message_history_toggle_favorite", { id });
}
export function MessageHistoryDelete(id) {
  return invoke("message_history_delete", { id });
}
export function MessageHistoryClear(scope, terminalId, projectName, terminalLabel) {
  return invoke("message_history_clear", { scope, terminalId, projectName, terminalLabel });
}
export function MessageHistoryFolders() {
  return invoke("message_history_folders");
}
export function MessageHistoryCreateFolder(name) {
  return invoke("message_history_create_folder", { name });
}
export function MessageHistoryDeleteFolder(id) {
  return invoke("message_history_delete_folder", { id });
}
export function MessageHistorySetFolder(messageId, folderId) {
  return invoke("message_history_set_folder", { messageId, folderId });
}
export function LoadSettings() {
  return invoke("load_settings");
}
export function LoadTerminals() {
  return invoke("load_terminals");
}
export function NotesAddMessage(project, chatID, text, attachments) {
  return invoke("notes_add_message", { project, chatId: chatID, text, attachments });
}
export function NotesCreateChat(project, title) {
  return invoke("notes_create_chat", { project, title });
}
export function NotesDeleteChat(project, chatID) {
  return invoke("notes_delete_chat", { project, chatId: chatID });
}
export function NotesDeleteMessage(project, id) {
  return invoke("notes_delete_message", { project, id });
}
export function NotesEditMessage(project, id, text) {
  return invoke("notes_edit_message", { project, id, text });
}
export function NotesListChats(project) {
  return invoke("notes_list_chats", { project });
}
export function NotesListMessages(project, chatID, limit, beforeID) {
  return invoke("notes_list_messages", { project, chatId: chatID, limit, beforeId: beforeID });
}
export function NotesReadAttachment(project, hash) {
  return invoke("notes_read_attachment", { project, hash });
}
export function NotesReadFileAsInput(path) {
  return invoke("notes_read_file_as_input", { path });
}
export function NotesRenameChat(project, chatID, title) {
  return invoke("notes_rename_chat", { project, chatId: chatID, title });
}
export function NotesSaveAttachment(project, hash, name) {
  return invoke("notes_save_attachment", { project, hash, name });
}
export function NotesSearch(project, query, limit) {
  return invoke("notes_search", { project, query, limit });
}
export function OpenFileInEditor(editorID, absPath, line, col) {
  return invoke("open_file_in_editor", { editorId: editorID, absPath, line, col });
}
export function OpenIn(targetID, projectPath) {
  return invoke("open_in", { targetId: targetID, projectPath });
}
export function OpenPathInDefaultApp(absPath) {
  return invoke("open_path_in_default_app", { absPath });
}
export function PauseTTS() {
  return invoke("pause_tts");
}
export function PlaySoundPreview(name, event) {
  return invoke("play_sound_preview", { name, event });
}
export function PickAudioFile() {
  return invoke("pick_audio_file");
}
export function PullBranch(cwd, strategy, flags) {
  return invoke("pull_branch", { cwd, strategy, flags });
}
export function ReadBranchNameInstructions() {
  return invoke("read_branch_name_instructions");
}
export function ReadClipboardFiles() {
  return invoke("read_clipboard_files");
}
export function ReadCommitInstructions() {
  return invoke("read_commit_instructions");
}
export function ReadConfig(name) {
  return invoke("read_config", { name });
}
export function ReadFile(absPath) {
  return invoke("read_file", { absPath });
}
export function ReadGlobalConfig() {
  return invoke("read_global_config");
}
export function ReadPRDescriptionInstructions() {
  return invoke("read_pr_description_instructions");
}
export function ReadPRTitleInstructions() {
  return invoke("read_pr_title_instructions");
}
export function ReadProjectInstructions(project, key) {
  return invoke("read_project_instructions", { project, key });
}
export function ReadRepoConfig(name) {
  return invoke("read_repo_config", { name });
}
export function ReadTemplate(name) {
  return invoke("read_template", { name });
}
export function RemovePortForward(project, localPort) {
  return invoke("remove_port_forward", { project, localPort });
}
export function RemoveProject(name) {
  return invoke("remove_project", { name });
}
export function RemoveProjectCascade(name) {
  return invoke("remove_project_cascade", { name });
}
export function RemoveProjects(names) {
  return invoke("remove_projects", { names });
}
export function RenameBranch(cwd, oldName, newName) {
  return invoke("rename_branch", { cwd, oldName, newName });
}
export function RenameTemplate(oldName, newName) {
  return invoke("rename_template", { oldName, newName });
}
export function ReorderProjects(order) {
  return invoke("reorder_projects", { order });
}
export function ResetClaudeHooks() {
  return invoke("reset_claude_hooks");
}
export function ResizeTerminal(id, cols, rows) {
  return invoke("resize_terminal", { id, cols, rows });
}
export function ResolveMergeConflictsWithAI(cwd, cli, model, effort, fast) {
  return invoke("resolve_merge_conflicts_with_ai", { cwd, cli, model, effort, fast });
}
export function ResolvePortConflict(c) {
  return invoke("resolve_port_conflict", { c });
}
export function RestoreDetachedWindows() {
  return invoke("restore_detached_windows");
}
export function ResumeTTS() {
  return invoke("resume_tts");
}
export function RunAction(projectName, actionName, inputValues) {
  return invoke("run_action", { projectName, actionName, inputValues });
}
export function RunActionBackground(projectName, actionName, inputValues) {
  return invoke("run_action_background", { projectName, actionName, inputValues });
}
export function SaveBranchNameInstructions(content) {
  return invoke("save_branch_name_instructions", { content });
}
export function SaveClipboardImage(b64Data, mimeType) {
  return invoke("save_clipboard_image", { b64Data, mimeType });
}
export function SaveCommitInstructions(content) {
  return invoke("save_commit_instructions", { content });
}
export function SaveConfig(name, content) {
  return invoke("save_config", { name, content });
}
export function SaveGlobalConfig(content) {
  return invoke("save_global_config", { content });
}
export function SaveGroups(groups) {
  return invoke("save_groups", { groups });
}
export function SavePRDescriptionInstructions(content) {
  return invoke("save_pr_description_instructions", { content });
}
export function SavePRTitleInstructions(content) {
  return invoke("save_pr_title_instructions", { content });
}
export function SaveProjectInstructions(project, key, content) {
  return invoke("save_project_instructions", { project, key, content });
}
export function SaveRepoConfig(name, content) {
  return invoke("save_repo_config", { name, content });
}
export function SaveSettings(s) {
  return invoke("save_settings", { s });
}
export function SaveTemplate(name, content) {
  return invoke("save_template", { name, content });
}
export function SaveTerminals(c) {
  return invoke("save_terminals", { c });
}
export function SaveTextFile(defaultName, content) {
  return invoke("save_text_file", { defaultName, content });
}
export function SaveWindowSize(width, height) {
  return invoke("save_window_size", { width, height });
}
export function SearchBranches(cwd, query) {
  return invoke("search_branches", { cwd, query });
}
export function SetProjectLabel(name, label) {
  return invoke("set_project_label", { name, label });
}
export function MoveProjectRoot(name, newRoot) {
  return invoke("move_project_root", { name, newRoot });
}
export function StartLogStreaming(projectName) {
  return invoke("start_log_streaming", { projectName });
}
export function StartProject(name, profile) {
  return invoke("start_project", { name, profile });
}
export function StartProjectWithServices(name, services) {
  return invoke("start_project_with_services", { name, services });
}
export function StartService(projectName, paneIndex) {
  return invoke("start_service", { projectName, paneIndex });
}
export function StartTerminal(projectName) {
  return invoke("start_terminal", { projectName });
}
export function StartTerminalForConfig(projectName, terminalName) {
  return invoke("start_terminal_for_config", { projectName, terminalName });
}
export function StartTerminalForRestore(projectName, terminalName) {
  return invoke("start_terminal_for_restore", { projectName, terminalName });
}
export function StartTerminalWithCwdEnv(projectName, cwd, env) {
  return invoke("start_terminal_with_cwd_env", { projectName, cwd, env });
}
export function StartTTS(text) {
  return invoke("start_tts", { text });
}
export function StartWatchingProject(path) {
  return invoke("start_watching_project", { path });
}
export function StopAll() {
  return invoke("stop_all");
}
export function StopLogStreaming(projectName) {
  return invoke("stop_log_streaming", { projectName });
}
export function StopProject(name) {
  return invoke("stop_project", { name });
}
export function StopService(projectName, paneIndex) {
  return invoke("stop_service", { projectName, paneIndex });
}
export function StopTerminal(id) {
  return invoke("stop_terminal", { id });
}
export function StopTTS() {
  return invoke("stop_tts");
}
export function StopWatchingProject() {
  return invoke("stop_watching_project");
}
export function TmuxInstalled() {
  return invoke("tmux_installed");
}
export function ToggleProjectService(name, serviceName) {
  return invoke("toggle_project_service", { name, serviceName });
}
export function TransformText(cwd, cli, model, effort, fast, instruction, text) {
  return invoke("transform_text", { cwd, cli, model, effort, fast, instruction, text });
}
export function UninstallKokoro() {
  return invoke("uninstall_kokoro");
}
export function UploadAndQuoteForTerminal(terminalID, localPaths) {
  return invoke("upload_and_quote_for_terminal", { terminalId: terminalID, localPaths });
}
export function UploadClipboardImageForTerminal(terminalID, b64Data, mimeType) {
  return invoke("upload_clipboard_image_for_terminal", { terminalId: terminalID, b64Data, mimeType });
}
export function VaultExportKey(passphrase) {
  return invoke("vault_export_key", { passphrase });
}
export function VaultImportKey(passphrase) {
  return invoke("vault_import_key", { passphrase });
}
export function WriteFile(absPath, content) {
  return invoke("write_file", { absPath, content });
}
export function WriteTerminal(id, data) {
  return invoke("write_terminal", { id, data });
}

// In-pane browser (Tauri multiwebview). The browser is a native child webview
// positioned over the BrowserPane's placeholder; these drive it.
export function OpenBrowser(id, url, x, y, width, height) {
  return invoke("open_browser", { id, url, x, y, width, height });
}
export function SetBrowserBounds(id, x, y, width, height) {
  return invoke("set_browser_bounds", { id, x, y, width, height });
}
export function NavigateBrowser(id, url) {
  return invoke("navigate_browser", { id, url });
}
export function BrowserBack(id) {
  return invoke("browser_back", { id });
}
export function BrowserForward(id) {
  return invoke("browser_forward", { id });
}
export function BrowserReload(id) {
  return invoke("browser_reload", { id });
}
export function HideBrowser(id) {
  return invoke("hide_browser", { id });
}
export function CloseBrowser(id) {
  return invoke("close_browser", { id });
}
export function SetBrowserTheme(id, dark) {
  return invoke("set_browser_theme", { id, dark });
}
export function VoiceToTextAvailable() {
  return invoke("voice_to_text_available");
}
export function VoiceToTextToggle() {
  return invoke("voice_to_text_toggle");
}
