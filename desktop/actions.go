package main

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ActionOutput struct {
	Line string `json:"line"`
}

type ActionDone struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// resolveActionCommand loads the named action (supporting "parent:child"
// nesting), substitutes {{key}} placeholders with inputValues, prepends
// exported env assignments, and returns the resolved shell command plus
// working directory.
func resolveActionCommand(projectName, actionName string, inputValues map[string]string) (cmdStr, cwd string, err error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", "", err
	}

	var action config.Action
	if parts := strings.SplitN(actionName, ":", 2); len(parts) == 2 {
		parent, ok := cfg.Actions[parts[0]]
		if !ok {
			return "", "", fmt.Errorf("action %q not found in project %q", parts[0], projectName)
		}
		action, ok = parent.ResolvedChild(parts[1])
		if !ok {
			return "", "", fmt.Errorf("child action %q not found in action %q", parts[1], parts[0])
		}
	} else {
		var ok bool
		action, ok = cfg.Actions[actionName]
		if !ok {
			return "", "", fmt.Errorf("action %q not found in project %q", actionName, projectName)
		}
	}

	cwd = config.ResolveCwd(cfg.Root, action.Cwd)

	cmdStr = action.Cmd
	if len(inputValues) > 0 {
		pairs := make([]string, 0, len(inputValues)*2)
		for k, v := range inputValues {
			pairs = append(pairs, "{{"+k+"}}", v)
		}
		cmdStr = strings.NewReplacer(pairs...).Replace(cmdStr)
	}
	if len(action.Env) > 0 {
		var parts []string
		for k, v := range action.Env {
			parts = append(parts, fmt.Sprintf("export %s=%s", k, shellQuote(v)))
		}
		parts = append(parts, cmdStr)
		cmdStr = strings.Join(parts, " && ")
	}
	return cmdStr, cwd, nil
}

// RunAction starts an action and streams output via events. Returns immediately.
// inputValues supplies user-provided values for {{key}} placeholders defined in the action's inputs.
func (a *App) RunAction(projectName string, actionName string, inputValues map[string]string) error {
	cmdStr, cwd, err := resolveActionCommand(projectName, actionName, inputValues)
	if err != nil {
		return err
	}

	cmd := exec.Command("/bin/sh", "-c", cmdStr)
	cmd.Dir = cwd

	// Merge stdout and stderr into a single pipe
	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		return err
	}

	// Close the write end when the command exits so the scanner unblocks
	go func() {
		cmd.Wait()
		pw.Close()
	}()

	go func() {
		scanner := bufio.NewScanner(pr)
		for scanner.Scan() {
			runtime.EventsEmit(a.ctx, "action-output", ActionOutput{Line: scanner.Text()})
		}

		done := ActionDone{Success: cmd.ProcessState.Success()}
		if !done.Success {
			done.Error = cmd.ProcessState.String()
		}
		runtime.EventsEmit(a.ctx, "action-done", done)
	}()

	return nil
}

// RunActionBackground runs an action synchronously from the caller's point of
// view: the RPC blocks until the command exits. On failure, the returned
// error includes a trimmed tail of the combined output so the frontend toast
// can surface a useful message without needing a streaming UI.
func (a *App) RunActionBackground(projectName string, actionName string, inputValues map[string]string) error {
	cmdStr, cwd, err := resolveActionCommand(projectName, actionName, inputValues)
	if err != nil {
		return err
	}

	cmd := exec.Command("/bin/sh", "-c", cmdStr)
	cmd.Dir = cwd

	out, err := cmd.CombinedOutput()
	if err != nil {
		tail := strings.TrimSpace(string(out))
		if len(tail) > 500 {
			tail = tail[len(tail)-500:]
		}
		if tail != "" {
			return fmt.Errorf("%s: %s", err, tail)
		}
		return err
	}
	return nil
}
