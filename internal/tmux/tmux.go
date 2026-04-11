package tmux

import (
	"fmt"
	"os"
	"os/exec"
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

func parseLines(out []byte) []string {
	raw := strings.Split(strings.TrimSpace(string(out)), "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func ListSessions() map[string]bool {
	sessions := make(map[string]bool)
	out, err := exec.Command("tmux", "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		return sessions
	}
	for _, name := range parseLines(out) {
		sessions[name] = true
	}
	return sessions
}

func ListPaneIDs(session string) []string {
	out, err := exec.Command("tmux", "list-panes", "-t", session, "-F", "#{pane_id}").Output()
	if err != nil {
		return nil
	}
	return parseLines(out)
}

func CapturePaneByID(paneID string, lines int) (string, error) {
	cmd := exec.Command("tmux", "capture-pane", "-t", paneID, "-p", "-J", "-S", fmt.Sprintf("-%d", lines))
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to capture pane %s: %w", paneID, err)
	}
	return strings.TrimRight(string(out), "\n"), nil
}

func KillSession(name string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", name)
	return cmd.Run()
}

// StopServicePane sends Ctrl-C to the pane, killing whatever command is running,
// then clears the pane's visible content and scrollback so it reads as fresh the
// next time the service is started. The pane itself is left open.
func StopServicePane(paneID string) error {
	if err := exec.Command("tmux", "send-keys", "-t", paneID, "C-c").Run(); err != nil {
		return err
	}
	// Clearing the pane is best-effort: reset the terminal state (-R) to clear
	// the visible area, then drop the scrollback buffer.
	_ = exec.Command("tmux", "send-keys", "-R", "-t", paneID, "C-l").Run()
	_ = exec.Command("tmux", "clear-history", "-t", paneID).Run()
	return nil
}

// StartServicePane runs the service's command in the given (already-existing) pane.
func StartServicePane(paneID, root string, svc config.Service) error {
	cwd := config.ResolveCwd(root, svc.Cwd)
	return sendKeys(paneID, buildCommand(cwd, svc))
}

func StartProject(cfg *config.ProjectConfig, profile string) error {
	serviceNames := cfg.ServicesForProfile(profile)
	if len(serviceNames) == 0 {
		return fmt.Errorf("no services to start for profile %q", profile)
	}
	return StartProjectServices(cfg, serviceNames)
}

func StartProjectServices(cfg *config.ProjectConfig, serviceNames []string) error {
	if len(serviceNames) == 0 {
		return fmt.Errorf("no services to start")
	}

	KillSession(cfg.Name)

	firstService := serviceNames[0]
	svc, ok := cfg.Services[firstService]
	if !ok {
		return fmt.Errorf("service %q not found in project config", firstService)
	}
	cwd := config.ResolveCwd(cfg.Root, svc.Cwd)

	createCmd := exec.Command("tmux", "new-session", "-d", "-s", cfg.Name, "-P", "-F", "#{pane_id}")
	createCmd.Dir = cwd
	out, err := createCmd.Output()
	if err != nil {
		return fmt.Errorf("failed to create tmux session: %w", err)
	}
	firstPaneID := strings.TrimSpace(string(out))

	// Send command to first pane
	if err := sendKeys(firstPaneID, buildCommand(cwd, svc)); err != nil {
		return fmt.Errorf("failed to start %s: %w", firstService, err)
	}

	// Split and send commands for remaining services
	for i, name := range serviceNames[1:] {
		svc, ok := cfg.Services[name]
		if !ok {
			return fmt.Errorf("service %q not found in project config", name)
		}
		cwd := config.ResolveCwd(cfg.Root, svc.Cwd)

		splitType := "-h" // horizontal split
		if i > 0 {
			splitType = "-v" // vertical split for 3rd+ panes
		}

		split := exec.Command("tmux", "split-window", splitType, "-t", cfg.Name, "-P", "-F", "#{pane_id}")
		split.Dir = cwd
		out, err := split.Output()
		if err != nil {
			return fmt.Errorf("failed to split window for %s: %w", name, err)
		}
		paneID := strings.TrimSpace(string(out))

		if err := sendKeys(paneID, buildCommand(cwd, svc)); err != nil {
			return fmt.Errorf("failed to start %s: %w", name, err)
		}
	}

	return nil
}

// SplitSessionPane splits the project's tmux window, runs the service command
// in the new pane, and rebalances the layout. Returns the new pane ID.
func SplitSessionPane(cfg *config.ProjectConfig, svc config.Service) (string, error) {
	cwd := config.ResolveCwd(cfg.Root, svc.Cwd)
	split := exec.Command("tmux", "split-window", "-t", cfg.Name, "-P", "-F", "#{pane_id}")
	split.Dir = cwd
	out, err := split.Output()
	if err != nil {
		return "", fmt.Errorf("split-window: %w", err)
	}
	paneID := strings.TrimSpace(string(out))
	if err := sendKeys(paneID, buildCommand(cwd, svc)); err != nil {
		return "", fmt.Errorf("send-keys to %s: %w", paneID, err)
	}
	_ = exec.Command("tmux", "select-layout", "-t", cfg.Name, "tiled").Run()
	return paneID, nil
}

// KillPane removes the given pane from its tmux window. Killing the last pane
// in a session destroys the session.
func KillPane(paneID string) error {
	return exec.Command("tmux", "kill-pane", "-t", paneID).Run()
}

func Attach(sessionName string) error {
	cmd := exec.Command("tmux", "attach", "-t", sessionName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func sendKeys(target, command string) error {
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

