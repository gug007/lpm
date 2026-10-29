// What each command the demo doesn't simulate returns: the empty value of its
// Rust return type. defaults.test.ts fails on a bridge command that is neither
// handled by a demo module nor listed here.
const NULL: string[] = [
  "accept_claude_pool_pick", "ack_terminal_data", "add_port_forward", "agent_last_answer",
  "agent_session_title", "apply_claude_limits", "apply_claude_statusline",
  "apply_claude_statusline_custom", "apply_codex_statusline", "attach_project",
  "branch_pull_request", "pull_request_discussion", "browser_back", "browser_forward", "browser_reload",
  "cancel_action_background", "check_aicl_is", "check_claude_hooks", "check_for_update",
  "claude_pool_state", "claude_session_state", "claude_statusline_preset_spec", "clear_job_state",
  "clear_job_state_global", "clear_openai_key", "clear_port_suggestions", "close_browser",
  "copy_claude_session_for_fork", "copy_png_image", "create_branch", "create_template", "delete_agent_skill",
  "delete_branch", "delete_job_history", "delete_memory_session", "delete_remote_tracking_ref",
  "delete_template", "detach_project", "dismiss_port_suggestion", "drain_pending_job_tasks",
  "focus_main_window", "follow_pause", "ignored_sync_cancel", "ignored_sync_forget",
  "ignored_sync_save", "ignored_sync_saved", "ignored_sync_set", "follow_resume", "follow_stop", "generate_agent_skill",
  "get_claude_statusline_state", "get_codex_statusline_state", "get_msys_mounts",
  "git_abort_merge", "git_auto_pull", "git_auto_pull_last", "git_auto_pull_undo", "git_continue_merge",
  "git_mark_conflict_resolved", "git_take_conflict_side",
  "git_discard_all", "git_discard_files", "git_fetch_all", "git_file_diff_ref",
  "git_file_diff_staged", "git_merge", "git_prune_remotes", "hide_browser", "hold_pane_status", "html_preview_root",
  "import_config", "install_kokoro", "install_update", "job_live_output",
  "list_agent_capabilities", "list_agent_sessions", "list_dirs", "list_project_terminals",
  "load_claude_accounts", "load_composer_actions", "load_generators", "load_groups",
  "load_work_statuses", "message_history_add", "message_history_clear",
  "message_history_create_folder", "message_history_delete", "message_history_delete_folder",
  "message_history_set_folder", "message_history_toggle_favorite",
  "move_project_root", "navigate_browser", "notes_add_message", "notes_create_chat",
  "notes_delete_chat", "notes_delete_message", "notes_edit_message", "notes_read_file_as_input",
  "notes_rename_chat", "notify_unattended", "open_browser", "open_file_in_editor", "open_in",
  "open_path_in_default_app", "pause_tts", "peer_add", "peer_add_ssh_host", "peer_discovery_start",
  "peer_discovery_stop", "peer_dispatch_reply", "peer_host_cancel_pairing",
  "peer_host_respond_pairing", "peer_host_revoke_device", "peer_host_set_config",
  "peer_host_start_pairing", "peer_invoke", "peer_joined_shares", "peer_pair_cancel",
  "peer_pair_request", "peer_reconnect", "peer_remote_pair", "peer_remove", "peer_set_alias",
  "peer_set_auto_sync", "peer_set_enabled", "peer_settings_get", "peer_settings_set",
  "peer_share_ask_type", "peer_share_decline_ask", "peer_share_join", "peer_share_join_cancel",
  "peer_share_leave", "peer_share_qr", "peer_share_remove_guest", "peer_share_respond",
  "peer_share_set_can_type", "peer_share_set_guest_can_type", "peer_share_start",
  "peer_share_stop", "peer_share_take_keyboards", "peer_shares", "peer_state", "peer_sync_run",
  "peer_sync_status", "peer_term_attach", "peer_term_detach", "peer_uninstall_host",
  "peer_update_host", "play_sound_preview", "preview_agent_skill_delete", "pull_branch", "push_weekly_recap",
  "quit_app", "read_agent_capability", "read_clipboard_image", "read_memory_sessions",
  "refresh_action_label", "refresh_agent_tools", "release_pane_status", "remote_rename_device",
  "remote_respond_pair_request", "remote_revoke_device", "remote_set_agent_options",
  "remote_set_composer_draft", "remote_set_config", "remote_set_keep_awake",
  "remote_set_terminal_labels", "remote_start_pairing", "remote_state", "remove_claude_account",
  "remove_port_forward", "rename_branch", "rename_memory_session", "rename_template",
  "reorder_projects", "reset_claude_hooks", "reset_codex_statusline", "resolve_port_conflict",
  "restore_detached_windows", "resume_claude_pool", "resume_tts", "reveal_in_finder",
  "rollback_update", "run_job_now", "save_branch_name_instructions", "save_claude_accounts",
  "save_commit_instructions", "save_composer_actions", "save_generators", "save_global_config",
  "save_groups", "save_pr_description_instructions", "save_pr_title_instructions",
  "save_project_instructions", "save_repo_config", "save_template", "save_window_size",
  "save_work_statuses", "send_job_followup", "send_later_add", "send_later_list",
  "send_later_remove", "send_later_reschedule", "send_later_send_now", "set_auto_pull",
  "set_browser_bounds", "set_browser_theme", "set_claude_account", "set_claude_account_choice",
  "set_claude_pool", "set_clipboard_text", "set_openai_key", "set_project_label", "share_png_image",
  "set_work_status", "start_clone_project", "start_tts", "start_watching_project", "stop_all",
  "stop_job_run", "stop_service", "stop_tts", "stop_watching_project", "sync_project_cancel",
  "tailnet_set_enabled", "tailnet_sign_in", "tailnet_sign_out", "tailnet_state",
  "take_share_join_link", "telegram_connect", "telegram_disconnect", "telegram_remove_chat",
  "telegram_status", "telegram_test", "terminal_claim_control", "terminal_claude_account",
  "terminal_control_owner", "terminal_present_control", "terminal_tab_op",
  "terminal_unpresent_control", "test_job_check", "trash_project", "uninstall_app",
  "uninstall_kokoro", "update_agent_skill", "vault_import_key", "voice_to_text_cancel",
  "voice_to_text_stop", "voice_to_text_toggle", "write_agent_capability", "write_memory_session",
  "restart_services", "schedule_update", "scheduled_update", "take_update_note",
];

const EMPTY_LIST: string[] = [
  "agent_recent_answers", "check_action_port_conflict", "check_port_conflicts",
  "check_port_conflicts_for_services", "duplicate_projects", "follow_list", "get_suggested_ports",
  "git_changed_files_ref", "git_changed_files_staged", "git_log_branch", "git_recent_commits", "git_merge_conflicts",
  "list_agent_commands", "list_detached_projects", "list_monospace_fonts", "list_open_in_targets",
  "list_port_forwards", "list_system_sounds", "list_templates", "message_history_folders",
  "message_history_query", "notes_list_chats", "notes_list_messages", "notes_search",
  "openai_voices", "read_clipboard_files", "remote_take_restore_requests",
  "remote_take_run_actions", "search_branches", "telegram_find_chats",
];

const FALSE: string[] = [
  "cancel_ai_generate", "cancel_scheduled_update", "cancel_update", "check_ghcli", "check_kokoro_installed",
  "focus_detached_window", "git_push_rebasing", "has_openai_key", "is_terminal_remote",
  "peer_cancel_mac_update", "save_text_file", "voice_to_text_available",
];

const EMPTY_STRING: string[] = [
  "claude_limits_account", "create_agent_skill", "create_pull_request", "export_config",
  "generate_action_yaml", "generate_branch_name", "generate_claude_statusline",
  "generate_pr_description", "generate_pr_title", "generate_project_config", "get_platform",
  "get_version", "message_history_save_draft", "git_diff", "git_diff_branch", "git_show_prefix", "git_show_commit", "media_http_base",
  "notes_read_attachment", "notes_save_attachment", "notes_save_attachment_data",
  "openai_tts_speak", "peer_update_mac", "peer_upload_file", "pick_audio_file", "pick_image_file",
  "preview_claude_statusline", "read_branch_name_instructions", "read_clipboard_text",
  "read_commit_instructions", "read_file", "read_global_config",
  "read_pr_description_instructions", "read_pr_title_instructions", "read_project_instructions",
  "read_template", "resolve_merge_conflicts_with_ai", "save_clipboard_image", "save_png_image",
  "save_generator_icon", "start_claude_login", "sync_project_start", "ignored_sync_start", "terminal_foreground_command",
  "transform_text", "upload_and_quote_for_terminal", "upload_clipboard_image_for_terminal",
  "upload_file_for_terminal", "vault_export_key", "voice_to_text_start",
];

const ZERO: string[] = [
  "git_commit_count", "peer_port_forward",
];

const EMPTY_MAP: string[] = [
  "ignored_sync_list", "ignored_sync_read", "ignored_sync_undo", "services_build",
];

export const DEFAULTS: Record<string, unknown> = Object.fromEntries([
  ...NULL.map((cmd) => [cmd, null]),
  ...EMPTY_LIST.map((cmd) => [cmd, []]),
  ...FALSE.map((cmd) => [cmd, false]),
  ...EMPTY_STRING.map((cmd) => [cmd, ""]),
  ...ZERO.map((cmd) => [cmd, 0]),
  ...EMPTY_MAP.map((cmd) => [cmd, {}]),
]);
