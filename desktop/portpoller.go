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
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	portPollInterval = 3 * time.Second
	portPollTimeout  = 6 * time.Second
)

// listingCommand is the remote command that produces a list of listening
// TCP sockets. ss is preferred (cheap, ubiquitous via iproute2);
// netstat is the fallback for older or stripped-down hosts. Both emit
// the local address as the 4th whitespace-separated field, which is
// what parseListeningPorts looks for.
const listingCommand = `(command -v ss >/dev/null 2>&1 && ss -tlnH) || ` +
	`(command -v netstat >/dev/null 2>&1 && netstat -tln 2>/dev/null | tail -n +3)`

// startPortPoller spawns one background goroutine that polls listening
// ports on the remote and emits port-suggested for new ones. Idempotent
// — a second call with the project already polling is a no-op. Silent
// when the project is local or fails to load.
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

// resumePortPollers restarts pollers for remote projects whose
// services survived an app restart (the session is still alive on the
// remote / in tmux). Without this, the user would have to Stop+Start to
// get suggestion toasts again.
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

	// First poll fires immediately so users don't wait a full interval
	// for the toast on a server that bound seconds before they hit Start.
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
		// Drop results when the context was cancelled mid-fetch:
		// otherwise a Stop click can race a successful in-flight poll
		// and repopulate the suggestion set right after the cleanup.
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
				// First poll establishes a baseline: anything
				// already listening at this point is ambient
				// (DBs, system services, alt-ssh, etc.), not
				// something the user just started — mark it
				// dismissed so subsequent polls don't surface
				// it. Declared service ports skip the baseline
				// so they still get suggested when the user
				// resumes a project whose services were already
				// running.
				if firstPoll && !declared[p] {
					a.preDismissPort(project, p)
					continue
				}
				a.observePort(project, p, declared)
			}
			pruned := a.pruneSuggestionsForPort(project, listening)
			// Emit on the first poll regardless: it transitions the
			// project from "not yet polled" to "baseline established"
			// and the popover/badge subscriber needs to render the
			// settled state. Subsequent polls only emit on real change.
			if firstPoll || pruned {
				runtime.EventsEmit(a.ctx, eventPortsChanged, project)
			}
			firstPoll = false
		}

		tick.Reset(portPollInterval)
	}
}

// fetchListeningPorts runs the remote listing command and parses the
// port numbers out of its output.
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

// declaredServicePorts collects the explicit port: N values from
// cfg.Services. Used as a "always interesting" allow-list so a service
// that legitimately listens on a low port (e.g. 80) still gets
// suggested even when shouldSuggestPort would otherwise skip it.
func declaredServicePorts(cfg *config.ProjectConfig) map[int]bool {
	out := make(map[int]bool, len(cfg.Services))
	for _, svc := range cfg.Services {
		if svc.Port > 0 && svc.Port <= 65535 {
			out[svc.Port] = true
		}
	}
	return out
}

// shouldSuggestPort filters out the ambient noise from a remote host:
// system services, the SSH port itself, and anything below 1024 unless
// the project's config explicitly mentions it.
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

// parseListeningPorts extracts unique port numbers from `ss -tlnH` or
// `netstat -tln` output. Both tools place the local address in the 4th
// whitespace-separated field — we look there exclusively so a peer
// column like `0.0.0.0:*` doesn't leak through.
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

// splitListenAddr normalises ss/netstat local-address tokens
// (`0.0.0.0:80`, `*:22`, `[::]:443`, netstat's bracket-less `:::3000`)
// into a host/port pair via net.SplitHostPort. Returns ok=false when
// the token has no recognisable port suffix.
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

// isLocalListenAddr accepts the wildcard / loopback forms that ss and
// netstat emit. Specific external IPs are skipped — those are usually
// system services bound to a single interface, not the dev server we
// want to forward.
func isLocalListenAddr(host string) bool {
	switch host {
	case "0.0.0.0", "127.0.0.1", "::", "::1":
		return true
	}
	return false
}
