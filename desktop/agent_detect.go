package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

const lpmHookMarker = "# lpm-hook"

// installAgentHooks auto-configures hooks for supported AI agents.
func (a *App) installAgentHooks() {
	a.installClaudeCodeHooks()
	a.installCodexHooks()
}

// --- Claude Code hooks (via ~/.claude/settings.json) ---

func (a *App) installClaudeCodeHooks() {
	settingsPath := filepath.Join(os.Getenv("HOME"), ".claude", "settings.json")

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return
	}

	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		return
	}

	hooks, _ := settings["hooks"].(map[string]any)
	if hooks == nil {
		hooks = make(map[string]any)
		settings["hooks"] = hooks
	}

	if hasMarker(hooks) {
		return
	}

	setRunning := sendCmd(`set_status $LPM_PROJECT_NAME claude_code Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID`)
	setDone := sendCmd(`set_status $LPM_PROJECT_NAME claude_code Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID`)
	clearStatus := sendCmd(`clear_status $LPM_PROJECT_NAME claude_code`)

	hook := func(cmd string) map[string]any {
		return map[string]any{
			"matcher": "",
			"hooks": []any{
				map[string]any{"type": "command", "command": cmd},
			},
		}
	}

	appendHook(hooks, "UserPromptSubmit", hook(setRunning))
	appendHook(hooks, "PreToolUse", hook(setRunning))
	appendHook(hooks, "Stop", hook(setDone))
	appendHook(hooks, "SessionEnd", hook(clearStatus))

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(settingsPath, out, 0644)
}

// --- Codex hooks (via ~/.codex/config.toml + ~/.codex/hooks.json) ---

func (a *App) installCodexHooks() {
	codexDir := filepath.Join(os.Getenv("HOME"), ".codex")
	configPath := filepath.Join(codexDir, "config.toml")
	hooksPath := filepath.Join(codexDir, "hooks.json")

	// Check if codex is installed
	if _, err := os.Stat(codexDir); err != nil {
		return
	}

	// Check if hooks already installed
	if data, err := os.ReadFile(hooksPath); err == nil {
		if strings.Contains(string(data), lpmHookMarker) {
			return
		}
	}

	// Enable codex_hooks feature in config.toml
	a.enableCodexHooksFeature(configPath)

	// Build hooks.json
	setRunning := sendCmd(`set_status $LPM_PROJECT_NAME codex Running --icon=sparkle --color=#10A37F --pane=$LPM_PANE_ID`)
	setDone := sendCmd(`set_status $LPM_PROJECT_NAME codex Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID`)

	hook := func(cmd string) []any {
		return []any{
			map[string]any{
				"hooks": []any{
					map[string]any{"type": "command", "command": cmd},
				},
			},
		}
	}

	hooksData := map[string]any{
		"hooks": map[string]any{
			"SessionStart":     hook(setRunning),
			"UserPromptSubmit": hook(setRunning),
			"PreToolUse":       hook(setRunning),
			"Stop":             hook(setDone),
		},
	}

	// If hooks.json exists, merge; otherwise create
	var existing map[string]any
	if data, err := os.ReadFile(hooksPath); err == nil {
		_ = json.Unmarshal(data, &existing)
	}

	if existing != nil {
		existingHooks, _ := existing["hooks"].(map[string]any)
		if existingHooks != nil {
			newHooks := hooksData["hooks"].(map[string]any)
			for event, entries := range newHooks {
				appendHook(existingHooks, event, entries.([]any)[0].(map[string]any))
			}
			hooksData = existing
		}
	}

	// Also add SessionEnd via clear (Codex hooks.json doesn't have SessionEnd,
	// but we use the notify config for cleanup)
	out, err := json.MarshalIndent(hooksData, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(hooksPath, out, 0644)

}

func (a *App) enableCodexHooksFeature(configPath string) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		data = []byte{}
	}

	content := string(data)
	if strings.Contains(content, "codex_hooks") {
		return
	}

	// Append feature flag
	if strings.Contains(content, "[features]") {
		content = strings.Replace(content, "[features]", "[features]\ncodex_hooks = true", 1)
	} else {
		content += "\n[features]\ncodex_hooks = true\n"
	}

	_ = os.WriteFile(configPath, []byte(content), 0644)
}


// --- Shared helpers ---

func sendCmd(cmd string) string {
	return `{ [ -n "$LPM_SOCKET_PATH" ] && [ -S "$LPM_SOCKET_PATH" ] && echo "` + cmd + `" | nc -w1 -U "$LPM_SOCKET_PATH" & } 2>/dev/null; ` + lpmHookMarker
}

func hasMarker(hooks map[string]any) bool {
	data, _ := json.Marshal(hooks)
	return len(data) > 0 && strings.Contains(string(data), lpmHookMarker)
}

func appendHook(hooks map[string]any, event string, entry map[string]any) {
	existing, _ := hooks[event].([]any)
	hooks[event] = append(existing, entry)
}
