package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gug007/lpm/internal/config"
)

type ActionResult struct {
	Success bool   `json:"success"`
	Output  string `json:"output"`
	Error   string `json:"error,omitempty"`
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

func (a *App) RunAction(projectName string, actionName string) (*ActionResult, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return nil, err
	}

	action, ok := cfg.Actions[actionName]
	if !ok {
		return nil, fmt.Errorf("action %q not found in project %q", actionName, projectName)
	}

	cwd := cfg.Root
	if action.Cwd != "" {
		if filepath.IsAbs(action.Cwd) {
			cwd = action.Cwd
		} else {
			cwd = filepath.Join(cfg.Root, action.Cwd)
		}
	}

	cmdStr := action.Cmd
	if len(action.Env) > 0 {
		var parts []string
		for k, v := range action.Env {
			parts = append(parts, fmt.Sprintf("export %s=%s", k, shellQuote(v)))
		}
		parts = append(parts, cmdStr)
		cmdStr = strings.Join(parts, " && ")
	}

	cmd := exec.Command("/bin/sh", "-c", cmdStr)
	cmd.Dir = cwd
	out, err := cmd.CombinedOutput()

	result := &ActionResult{
		Success: err == nil,
		Output:  string(out),
	}
	if err != nil {
		result.Error = err.Error()
	}
	return result, nil
}
