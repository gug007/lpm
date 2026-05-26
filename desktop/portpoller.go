package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
)

const (
	portPollInterval = 3 * time.Second
	portPollTimeout  = 6 * time.Second
)

// listingCommand: ss or netstat output. Both place local address in field 4,
// which parseListeningPorts depends on.
const listingCommand = `(command -v ss >/dev/null 2>&1 && ss -tlnH) || ` +
	`(command -v netstat >/dev/null 2>&1 && netstat -tln 2>/dev/null | tail -n +3)`

// startPortPoller is idempotent; silent for local or unloadable projects.
func (a *App) startPortPoller(project string) {
	cfg, err := config.LoadProject(project)
	if err != nil || !cfg.IsRemote() {
		return
	}

	a.pollerMu.Lock()
	if _, exists := a.pollers[project]; exists {
		a.pollerMu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.pollers[project] = cancel
	a.pollerMu.Unlock()

	go a.runPortPoller(ctx, project, cfg)
}

func (a *App) stopPortPoller(project string) {
	a.pollerMu.Lock()
	cancel, exists := a.pollers[project]
	delete(a.pollers, project)
	a.pollerMu.Unlock()
	if exists {
		cancel()
	}
}

// resumePortPollers restarts pollers for projects whose services survived
// an app restart, so the user doesn't have to Stop+Start to get suggestions.
func (a *App) resumePortPollers() {
	names, err := config.ListProjects()
	if err != nil {
		return
	}
	for _, name := range names {
		cfg, err := config.LoadProject(name)
		if err != nil || !cfg.IsRemote() {
			continue
		}
		if !tmux.SessionExists(cfg.Name) {
			continue
		}
		a.startPortPoller(name)
	}
}

func (a *App) stopAllPortPollers() {
	a.pollerMu.Lock()
	pollers := a.pollers
	a.pollers = make(map[string]context.CancelFunc)
	a.pollerMu.Unlock()
	for _, c := range pollers {
		c()
	}
}

func (a *App) runPortPoller(ctx context.Context, project string, cfg *config.ProjectConfig) {
	declared := declaredServicePorts(cfg)
	sshPort := cfg.SSH.Port
	if sshPort == 0 {
		sshPort = 22
	}

	// Fire immediately so a server that bound just before Start gets
	// a toast without waiting a full interval.
	tick := time.NewTimer(0)
	defer tick.Stop()

	warnedFailure := false
	firstPoll := true
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}

		ports, err := a.fetchListeningPorts(ctx, cfg)
		// Drop results on cancellation — a Stop click racing an in-flight
		// poll would otherwise repopulate the suggestion set after cleanup.
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			if !warnedFailure {
				fmt.Fprintf(os.Stderr, "warning: port poll for %q failed: %v\n", project, err)
				warnedFailure = true
			}
		} else {
			warnedFailure = false
			listening := make(map[int]bool, len(ports))
			for _, p := range ports {
				listening[p] = true
				if !shouldSuggestPort(p, sshPort, declared) {
					continue
				}
				// Baseline pass: pre-existing listens are ambient, not
				// user-started. Declared service ports skip the baseline
				// so they still surface when resuming a running project.
				if firstPoll && !declared[p] {
					a.preDismissPort(project, p)
					continue
				}
				a.observePort(project, p, declared)
			}
			pruned := a.pruneSuggestionsForPort(project, listening)
			// Subscribers need the "baseline established" state on the
			// first poll, so emit unconditionally then.
			if firstPoll || pruned {
				a.wails.Event.Emit(eventPortsChanged, project)
			}
			firstPoll = false
		}

		tick.Reset(portPollInterval)
	}
}

func (a *App) fetchListeningPorts(ctx context.Context, cfg *config.ProjectConfig) ([]int, error) {
	pollCtx, cancel := context.WithTimeout(ctx, portPollTimeout)
	defer cancel()

	argv := config.SSHCommandArgv(cfg, "", nil, listingCommand)
	cmd := exec.CommandContext(pollCtx, argv[0], argv[1:]...)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	return parseListeningPorts(string(out)), nil
}

// declaredServicePorts forces low-port services (e.g. 80) past the
// shouldSuggestPort ambient-noise filter.
func declaredServicePorts(cfg *config.ProjectConfig) map[int]bool {
	out := make(map[int]bool, len(cfg.Services))
	for _, svc := range cfg.Services {
		if svc.Port > 0 && svc.Port <= 65535 {
			out[svc.Port] = true
		}
	}
	return out
}

// shouldSuggestPort skips the SSH port and (undeclared) sub-1024 ports.
func shouldSuggestPort(port, sshPort int, declared map[int]bool) bool {
	if port <= 0 || port > 65535 {
		return false
	}
	if port == sshPort {
		return false
	}
	if declared[port] {
		return true
	}
	return port >= 1024
}

// parseListeningPorts reads only field 4 (local address) so the peer
// column (e.g. `0.0.0.0:*`) can't leak through.
func parseListeningPorts(s string) []int {
	seen := make(map[int]bool)
	var out []int
	for _, line := range strings.Split(s, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		host, portStr, ok := splitListenAddr(fields[3])
		if !ok {
			continue
		}
		if !isLocalListenAddr(host) {
			continue
		}
		p, err := strconv.Atoi(portStr)
		if err != nil || p <= 0 || p > 65535 {
			continue
		}
		if seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

// splitListenAddr normalises ss/netstat tokens (`0.0.0.0:80`, `*:22`,
// `[::]:443`, `:::3000`) for net.SplitHostPort.
func splitListenAddr(token string) (host, port string, ok bool) {
	switch {
	case strings.HasPrefix(token, "*:"):
		token = "0.0.0.0:" + token[2:]
	case strings.HasPrefix(token, ":::"):
		// netstat's IPv6 wildcard is unbracketed; SplitHostPort
		// requires brackets.
		token = "[::]:" + token[3:]
	}
	host, port, err := net.SplitHostPort(token)
	if err != nil {
		return "", "", false
	}
	return host, port, true
}

// isLocalListenAddr rejects specific external IPs — those are usually
// system services bound to a single interface, not user dev servers.
func isLocalListenAddr(host string) bool {
	switch host {
	case "0.0.0.0", "127.0.0.1", "::", "::1":
		return true
	}
	return false
}
