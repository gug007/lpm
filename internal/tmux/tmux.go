package tmux

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gug007/lpm/internal/config"
)

func init() {
	// When launched as a macOS .app from Finder, PATH is minimal and won't
	// include Homebrew paths. Ensure common locations are present so that
	// exec.Command("tmux", ...) can find the binary.
	extra := []string{"/opt/homebrew/bin", "/usr/local/bin"}
	current := os.Getenv("PATH")
	for _, dir := range extra {
		if !strings.Contains(current, dir) {
			current = dir + ":" + current
		}
	}
	os.Setenv("PATH", current)
}

func EnsureInstalled() error {
	if _, err := exec.LookPath("tmux"); err != nil {
		return fmt.Errorf("tmux is required but not installed. Install it with: brew install tmux")
	}
	return nil
}

func SessionExists(name string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}

func ListSessions() map[string]bool {
	sessions := make(map[string]bool)
	out, err := exec.Command("tmux", "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		return sessions
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" {
			sessions[line] = true
		}
	}
	return sessions
}

func CapturePaneLogs(session string, paneIndex int, lines int) (string, error) {
	target := fmt.Sprintf("%s:0.%d", session, paneIndex)
	cmd := exec.Command("tmux", "capture-pane", "-t", target, "-p", "-J", "-S", fmt.Sprintf("-%d", lines))
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to capture pane %s: %w", target, err)
	}
	return strings.TrimRight(string(out), "\n"), nil
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

	KillSession(cfg.Name)

	// Create new session with first service
	firstService := serviceNames[0]
	svc, ok := cfg.Services[firstService]
	if !ok {
		return fmt.Errorf("service %q not found in project config", firstService)
	}
	cwd := resolveWorkDir(cfg.Root, svc.Cwd)

	createCmd := exec.Command("tmux", "new-session", "-d", "-s", cfg.Name)
	createCmd.Dir = cwd
	if err := createCmd.Run(); err != nil {
		return fmt.Errorf("failed to create tmux session: %w", err)
	}

	// Send command to first pane
	if err := sendKeys(cfg.Name, "0.0", buildCommand(cwd, svc)); err != nil {
		return fmt.Errorf("failed to start %s: %w", firstService, err)
	}

	// Split and send commands for remaining services
	for i, name := range serviceNames[1:] {
		svc, ok := cfg.Services[name]
		if !ok {
			return fmt.Errorf("service %q not found in project config", name)
		}
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
		if err := sendKeys(cfg.Name, pane, buildCommand(cwd, svc)); err != nil {
			return fmt.Errorf("failed to start %s: %w", name, err)
		}
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

func sendKeys(session, pane, command string) error {
	target := fmt.Sprintf("%s:%s", session, pane)
	cmd := exec.Command("tmux", "send-keys", "-t", target, command, "Enter")
	return cmd.Run()
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

func buildCommand(cwd string, svc config.Service) string {
	parts := []string{fmt.Sprintf("cd %s", shellQuote(cwd))}

	for k, v := range svc.Env {
		parts = append(parts, fmt.Sprintf("export %s=%s", k, shellQuote(v)))
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
