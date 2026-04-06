package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// lpmHookMarker is embedded in hook commands so we can detect our own hooks.
const lpmHookMarker = "# lpm-hook"

// installAgentHooks auto-configures Claude Code hooks in ~/.claude/settings.json.
// Hooks talk directly to the Unix socket via nc — no lpm CLI binary needed.
// Conditional on $LPM_SOCKET_PATH, so they're no-ops outside lpm terminals.
func (a *App) installAgentHooks() {
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

	// Check if our hooks are already installed
	if hasLpmHook(hooks) {
		return
	}

	// Socket commands that match the protocol in socket.go
	setRunning := sendCmd(`set_status $LPM_PROJECT_NAME claude_code Running --icon=bolt --color=#4C8DFF`)
	setIdle := sendCmd(`set_status $LPM_PROJECT_NAME claude_code Idle --icon=circle --color=#888888`)
	clearStatus := sendCmd(`clear_status $LPM_PROJECT_NAME claude_code`)

	lpmHook := func(cmd string) map[string]any {
		return map[string]any{
			"matcher": "",
			"hooks": []any{
				map[string]any{
					"type":    "command",
					"command": cmd,
				},
			},
		}
	}

	appendHook(hooks, "UserPromptSubmit", lpmHook(setRunning))
	appendHook(hooks, "PreToolUse", lpmHook(setRunning))
	appendHook(hooks, "Stop", lpmHook(setIdle))
	appendHook(hooks, "SessionEnd", lpmHook(clearStatus))

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(settingsPath, out, 0644)
}

func sendCmd(cmd string) string {
	return `{ [ -n "$LPM_SOCKET_PATH" ] && [ -S "$LPM_SOCKET_PATH" ] && echo "` + cmd + `" | nc -w1 -U "$LPM_SOCKET_PATH" & } 2>/dev/null; ` + lpmHookMarker
}

func hasLpmHook(hooks map[string]any) bool {
	data, _ := json.Marshal(hooks)
	return len(data) > 0 && strings.Contains(string(data), lpmHookMarker)
}

func appendHook(hooks map[string]any, event string, entry map[string]any) {
	existing, _ := hooks[event].([]any)
	hooks[event] = append(existing, entry)
}
