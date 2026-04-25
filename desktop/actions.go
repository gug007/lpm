package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
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

type actionPlan struct {
	cmdStr string
	cwd    string
	// onExit, when non-nil, runs after the command terminates. Used by
	// mode: sync to push the rsync mirror back to the remote.
	onExit func()
}

func (a *App) resolveActionCommand(projectName, actionName string, inputValues map[string]string) (*actionPlan, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return nil, err
	}

	var action config.Action
	if parts := strings.SplitN(actionName, ":", 2); len(parts) == 2 {
		parent, ok := cfg.Actions[parts[0]]
		if !ok {
			return nil, fmt.Errorf("action %q not found in project %q", parts[0], projectName)
		}
		action, ok = parent.ResolvedChild(parts[1])
		if !ok {
			return nil, fmt.Errorf("child action %q not found in action %q", parts[1], parts[0])
		}
	} else {
		var ok bool
		action, ok = cfg.Actions[actionName]
		if !ok {
			return nil, fmt.Errorf("action %q not found in project %q", actionName, projectName)
		}
	}

	rawCmd := action.Cmd
	if len(inputValues) > 0 {
		pairs := make([]string, 0, len(inputValues)*2)
		for k, v := range inputValues {
			pairs = append(pairs, "{{"+k+"}}", v)
		}
		rawCmd = strings.NewReplacer(pairs...).Replace(rawCmd)
	}

	if cfg.IsRemote() && action.Mode == config.ActionModeSync {
		local, err := a.ensureProjectSync(cfg)
		if err != nil {
			return nil, err
		}
		return &actionPlan{
			cmdStr: config.BuildLocalScript(action.Env, rawCmd),
			cwd:    filepath.Join(local, action.Cwd),
			onExit: func() { a.pushProjectSyncAsync(cfg) },
		}, nil
	}

	if cfg.IsRemote() {
		return &actionPlan{
			cmdStr: config.SSHCommandLine(cfg, action.Cwd, action.Env, rawCmd),
			cwd:    cfg.Root,
		}, nil
	}

	return &actionPlan{
		cmdStr: config.BuildLocalScript(action.Env, rawCmd),
		cwd:    config.ResolveCwd(cfg.Root, action.Cwd),
	}, nil
}

// RunAction starts an action and streams output via events. Returns immediately.
// inputValues supplies user-provided values for {{key}} placeholders defined in the action's inputs.
func (a *App) RunAction(projectName string, actionName string, inputValues map[string]string) error {
	plan, err := a.resolveActionCommand(projectName, actionName, inputValues)
	if err != nil {
		return err
	}

	cmd := exec.Command("/bin/sh", "-c", plan.cmdStr)
	cmd.Dir = plan.cwd

	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		return err
	}

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

		if plan.onExit != nil {
			plan.onExit()
		}
	}()

	return nil
}

// RunActionBackground runs an action synchronously from the caller's point of
// view: the RPC blocks until the command exits. On failure, the returned
// error includes a trimmed tail of the combined output. mode: sync push
// is fired in the background so the RPC isn't held open by it.
func (a *App) RunActionBackground(projectName string, actionName string, inputValues map[string]string) error {
	plan, err := a.resolveActionCommand(projectName, actionName, inputValues)
	if err != nil {
		return err
	}

	cmd := exec.Command("/bin/sh", "-c", plan.cmdStr)
	cmd.Dir = plan.cwd

	out, runErr := cmd.CombinedOutput()
	if plan.onExit != nil {
		plan.onExit()
	}
	if runErr != nil {
		if tail := config.TrimTail(out, 500); tail != "" {
			return errors.New(runErr.Error() + ": " + tail)
		}
		return runErr
	}
	return nil
}
