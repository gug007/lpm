package tmux

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gug007/lpm/internal/config"
)

func SessionExists(name string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}

func KillSession(name string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", name)
	return cmd.Run()
}

func StartProject(cfg *config.ProjectConfig, profile string) error {
	serviceNames := cfg.ServicesForProfile(profile)
	if len(serviceNames) == 0 {
		return fmt.Errorf("no services to start for profile %q", profile)
	}

	// Kill existing session if running
	if SessionExists(cfg.Name) {
		KillSession(cfg.Name)
	}

	// Create new session with first service
	firstService := serviceNames[0]
	svc := cfg.Services[firstService]
	cwd := resolveWorkDir(cfg.Root, svc.Cwd)

	createCmd := exec.Command("tmux", "new-session", "-d", "-s", cfg.Name)
	createCmd.Dir = cwd
	if err := createCmd.Run(); err != nil {
		return fmt.Errorf("failed to create tmux session: %w", err)
	}

	// Send command to first pane
	sendKeys(cfg.Name, "0.0", buildCommand(cwd, svc))

	// Split and send commands for remaining services
	for i, name := range serviceNames[1:] {
		svc := cfg.Services[name]
		cwd := resolveWorkDir(cfg.Root, svc.Cwd)

		splitType := "-h" // horizontal split
		if i > 0 {
			splitType = "-v" // vertical split for 3rd+ panes
		}

		split := exec.Command("tmux", "split-window", splitType, "-t", cfg.Name)
		split.Dir = cwd
		if err := split.Run(); err != nil {
			return fmt.Errorf("failed to split window for %s: %w", name, err)
		}

		pane := fmt.Sprintf("0.%d", i+1)
		sendKeys(cfg.Name, pane, buildCommand(cwd, svc))
	}

	return nil
}

func Attach(sessionName string) error {
	cmd := exec.Command("tmux", "attach", "-t", sessionName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func sendKeys(session, pane, command string) {
	target := fmt.Sprintf("%s:%s", session, pane)
	cmd := exec.Command("tmux", "send-keys", "-t", target, command, "Enter")
	cmd.Run()
}

func buildCommand(cwd string, svc config.Service) string {
	parts := []string{fmt.Sprintf("cd %s", cwd)}

	for k, v := range svc.Env {
		parts = append(parts, fmt.Sprintf("export %s=%s", k, v))
	}

	parts = append(parts, svc.Cmd)
	return strings.Join(parts, " && ")
}

func resolveWorkDir(root, cwd string) string {
	if cwd == "" {
		return root
	}
	if filepath.IsAbs(cwd) {
		return cwd
	}
	return filepath.Join(root, cwd)
}
