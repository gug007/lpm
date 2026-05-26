package main

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/portcheck"
)

const (
	eventPortsChanged      = "ports-changed"
	eventPortAutoForwarded = "port-auto-forwarded"
	eventPortForwardFailed = "port-forward-failed"
)

// portForward is one active `ssh -N -L` tunnel. The cancel func kills the
// underlying ssh process, kept beside the *exec.Cmd.
type portForward struct {
	LocalPort  int `json:"localPort"`
	RemotePort int `json:"remotePort"`
	cmd        *exec.Cmd
	cancel     context.CancelFunc
}

type PortForward struct {
	LocalPort  int `json:"localPort"`
	RemotePort int `json:"remotePort"`
}

func (a *App) ListPortForwards(project string) []PortForward {
	a.pfMu.Lock()
	defer a.pfMu.Unlock()
	pfs := a.pfs[project]
	out := make([]PortForward, 0, len(pfs))
	for _, p := range pfs {
		out = append(out, PortForward{LocalPort: p.LocalPort, RemotePort: p.RemotePort})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].RemotePort < out[j].RemotePort })
	return out
}

// AddPortForward opens a new `ssh -N -L localPort:127.0.0.1:remotePort`
// tunnel. localPort=0 picks a free port. Idempotent on remote port: if a
// forward already exists, returns it without spawning a second ssh.
func (a *App) AddPortForward(project string, remotePort int, localPort int) (PortForward, error) {
	if remotePort <= 0 || remotePort > 65535 {
		return PortForward{}, fmt.Errorf("invalid remote port: %d", remotePort)
	}
	if localPort < 0 || localPort > 65535 {
		return PortForward{}, fmt.Errorf("invalid local port: %d", localPort)
	}
	cfg, err := config.LoadProject(project)
	if err != nil {
		return PortForward{}, fmt.Errorf("load project: %w", err)
	}
	if !cfg.IsRemote() {
		return PortForward{}, fmt.Errorf("project %q is not a remote SSH project", project)
	}

	a.pfMu.Lock()
	for _, p := range a.pfs[project] {
		if p.RemotePort == remotePort {
			existing := PortForward{LocalPort: p.LocalPort, RemotePort: p.RemotePort}
			a.pfMu.Unlock()
			return existing, nil
		}
	}
	a.pfMu.Unlock()

	if localPort == 0 {
		// Prefer mirroring the remote port locally — users naturally
		// type `localhost:3000` to hit a remote :3000, and almost
		// always something else has the port if it isn't free. Fall
		// back to a free port only on conflict.
		if portcheck.CanBind(remotePort) {
			localPort = remotePort
		} else {
			localPort, err = pickFreeLocalPort()
			if err != nil {
				return PortForward{}, fmt.Errorf("pick local port: %w", err)
			}
		}
	}

	args := []string{
		"-N",
		"-o", "ExitOnForwardFailure=yes",
		"-o", "ServerAliveInterval=30",
		"-L", fmt.Sprintf("127.0.0.1:%d:127.0.0.1:%d", localPort, remotePort),
	}
	for _, a := range config.SSHArgs(cfg.SSH) {
		// `-t` (force tty) is meaningless with `-N` — drop it so ssh
		// doesn't warn about "Pseudo-terminal will not be allocated".
		if a == "-t" {
			continue
		}
		args = append(args, a)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, "ssh", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		cancel()
		return PortForward{}, fmt.Errorf("start ssh: %w", err)
	}

	// Single Wait goroutine — calling Wait twice would panic, and both the
	// readiness check and the lifecycle cleanup goroutine consume exitCh.
	exitCh := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(exitCh)
	}()

	if err := waitForLocalListen(localPort, 4*time.Second, exitCh); err != nil {
		cancel()
		<-exitCh
		if tail := config.TrimTail(stderr.Bytes(), 200); tail != "" {
			return PortForward{}, fmt.Errorf("%s: %s", err, tail)
		}
		return PortForward{}, err
	}

	pf := &portForward{
		LocalPort:  localPort,
		RemotePort: remotePort,
		cmd:        cmd,
		cancel:     cancel,
	}

	a.pfMu.Lock()
	a.pfs[project] = append(a.pfs[project], pf)
	a.pfMu.Unlock()

	go func() {
		<-exitCh
		a.removePortForward(project, pf)
		a.wails.Event.Emit(eventPortsChanged, project)
	}()

	a.markPortSuggested(project, remotePort)
	a.wails.Event.Emit(eventPortsChanged, project)
	return PortForward{LocalPort: localPort, RemotePort: remotePort}, nil
}

// RemovePortForward kills the ssh process for the named local port. No
// error if no such forward exists.
func (a *App) RemovePortForward(project string, localPort int) error {
	a.pfMu.Lock()
	pfs := a.pfs[project]
	var found *portForward
	rest := make([]*portForward, 0, len(pfs))
	for _, p := range pfs {
		if p.LocalPort == localPort {
			found = p
			continue
		}
		rest = append(rest, p)
	}
	a.pfs[project] = rest
	a.pfMu.Unlock()

	if found != nil {
		found.cancel()
	}
	a.wails.Event.Emit(eventPortsChanged, project)
	return nil
}

func (a *App) removePortForward(project string, target *portForward) {
	a.pfMu.Lock()
	defer a.pfMu.Unlock()
	pfs := a.pfs[project]
	rest := make([]*portForward, 0, len(pfs))
	for _, p := range pfs {
		if p == target {
			continue
		}
		rest = append(rest, p)
	}
	a.pfs[project] = rest
}

// stopProjectPortForwards kills every forward owned by project and
// resets its suggestion state, so stopped/removed projects don't leak ssh
// or leave a stale "N new" badge.
func (a *App) stopProjectPortForwards(project string) {
	a.pfMu.Lock()
	pfs := a.pfs[project]
	delete(a.pfs, project)
	a.pfMu.Unlock()
	for _, p := range pfs {
		p.cancel()
	}
	a.suggestedMu.Lock()
	delete(a.suggested, project)
	delete(a.dismissed, project)
	a.suggestedMu.Unlock()
	a.wails.Event.Emit(eventPortsChanged, project)
}

func (a *App) stopAllPortForwards() {
	a.pfMu.Lock()
	all := a.pfs
	a.pfs = make(map[string][]*portForward)
	a.pfMu.Unlock()
	for _, pfs := range all {
		for _, p := range pfs {
			p.cancel()
		}
	}
}

func pickFreeLocalPort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// waitForLocalListen polls until something accepts on 127.0.0.1:port.
// Returns early when exitCh closes — that means ssh exited before the
// listener came up; the caller's stderr buffer holds the real reason.
func waitForLocalListen(port int, timeout time.Duration, exitCh <-chan struct{}) error {
	addr := "127.0.0.1:" + strconv.Itoa(port)
	deadline := time.After(timeout)
	for {
		select {
		case <-exitCh:
			return fmt.Errorf("ssh exited before listener was ready")
		case <-deadline:
			return fmt.Errorf("timed out waiting for local listener on %s", addr)
		default:
		}
		conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(75 * time.Millisecond)
	}
}

// localhostURLPattern captures ports from URLs common dev servers print on
// startup. 0.0.0.0 covers servers bound to all interfaces.
var localhostURLPattern = regexp.MustCompile(`https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b`)

// ansiCSIPattern strips CSI escapes so chalk-formatted lines like
// `http://\x1b[36mlocalhost\x1b[39m:3000` still match.
var ansiCSIPattern = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)

// sniffPortsFromOutput records new localhost URLs as suggestions. The "://"
// prefilter skips the regex on the vast majority of flushes.
func (a *App) sniffPortsFromOutput(project string, declared map[int]bool, text string) {
	if declared == nil || !strings.Contains(text, "://") {
		return
	}
	clean := ansiCSIPattern.ReplaceAllString(text, "")
	matches := localhostURLPattern.FindAllStringSubmatch(clean, -1)
	for _, m := range matches {
		port, err := strconv.Atoi(m[1])
		if err != nil || port <= 0 || port > 65535 {
			continue
		}
		a.observePort(project, port, declared)
	}
}

// observePort is the single entry point for URL-sniff and remote-poll
// discoveries. Applies dedup-and-dismiss then auto-forwards declared ports
// or surfaces a click-to-forward suggestion for the rest. Callers pass
// declared so a detection burst doesn't re-read YAML per port.
func (a *App) observePort(project string, port int, declared map[int]bool) {
	if a.alreadyForwardingRemote(project, port) {
		return
	}
	a.suggestedMu.Lock()
	if a.dismissed[project][port] {
		a.suggestedMu.Unlock()
		return
	}
	if a.suggested[project] == nil {
		a.suggested[project] = make(map[int]bool)
	}
	if a.suggested[project][port] {
		a.suggestedMu.Unlock()
		return
	}
	a.suggested[project][port] = true
	a.suggestedMu.Unlock()

	if declared[port] {
		a.autoForwardSem <- struct{}{}
		go func() {
			defer func() { <-a.autoForwardSem }()
			a.autoForward(project, port)
		}()
		return
	}

	a.wails.Event.Emit(eventPortsChanged, project)
}

// autoForward opens a tunnel and emits a toast so the user sees what was
// wired up. Reserved for declared service ports; everything else surfaces
// a suggestion for explicit confirmation.
func (a *App) autoForward(project string, remotePort int) {
	pf, err := a.AddPortForward(project, remotePort, 0)
	if err != nil {
		a.wails.Event.Emit(eventPortForwardFailed, map[string]any{
			"project":    project,
			"remotePort": remotePort,
			"error":      err.Error(),
		})
		return
	}
	a.wails.Event.Emit(eventPortAutoForwarded, map[string]any{
		"project":    project,
		"remotePort": remotePort,
		"localPort":  pf.LocalPort,
	})
}

func (a *App) alreadyForwardingRemote(project string, remotePort int) bool {
	a.pfMu.Lock()
	defer a.pfMu.Unlock()
	for _, p := range a.pfs[project] {
		if p.RemotePort == remotePort {
			return true
		}
	}
	return false
}

// markPortSuggested seeds the suggested map without emitting an event.
// Called when an explicit user action implies the port was discovered.
func (a *App) markPortSuggested(project string, port int) {
	a.suggestedMu.Lock()
	defer a.suggestedMu.Unlock()
	if a.suggested[project] == nil {
		a.suggested[project] = make(map[int]bool)
	}
	a.suggested[project][port] = true
}

// preDismissPort silently dismisses a port — used by the poller's baseline
// pass to suppress ambient listeners so only ports opened after polling
// started get suggested.
func (a *App) preDismissPort(project string, port int) {
	a.suggestedMu.Lock()
	defer a.suggestedMu.Unlock()
	if a.dismissed[project] == nil {
		a.dismissed[project] = make(map[int]bool)
	}
	a.dismissed[project][port] = true
}

// pruneSuggestionsForPort drops suggested ports that no longer listen on
// the remote. Without this the suggested set grows monotonically. Dismissed
// state is kept on purpose — the user's "no" outlasts a service restart.
func (a *App) pruneSuggestionsForPort(project string, listening map[int]bool) bool {
	a.suggestedMu.Lock()
	defer a.suggestedMu.Unlock()
	pruned := false
	for port := range a.suggested[project] {
		if !listening[port] {
			delete(a.suggested[project], port)
			pruned = true
		}
	}
	return pruned
}

func (a *App) DismissPortSuggestion(project string, port int) {
	a.suggestedMu.Lock()
	if a.dismissed[project] == nil {
		a.dismissed[project] = make(map[int]bool)
	}
	a.dismissed[project][port] = true
	a.suggestedMu.Unlock()
	a.wails.Event.Emit(eventPortsChanged, project)
}

func (a *App) ClearPortSuggestions(project string) {
	a.suggestedMu.Lock()
	suggested := a.suggested[project]
	if a.dismissed[project] == nil {
		a.dismissed[project] = make(map[int]bool)
	}
	for port := range suggested {
		a.dismissed[project][port] = true
	}
	a.suggestedMu.Unlock()
	a.wails.Event.Emit(eventPortsChanged, project)
}

// GetSuggestedPorts returns remote ports not forwarded and not dismissed.
// The popover queries this on open to render suggestions when the toast
// was lost (e.g. emitted before the listener mounted).
func (a *App) GetSuggestedPorts(project string) []int {
	a.suggestedMu.Lock()
	suggested := a.suggested[project]
	dismissed := a.dismissed[project]
	out := make([]int, 0, len(suggested))
	for port := range suggested {
		if dismissed[port] {
			continue
		}
		out = append(out, port)
	}
	a.suggestedMu.Unlock()

	keep := out[:0]
	for _, port := range out {
		if a.alreadyForwardingRemote(project, port) {
			continue
		}
		keep = append(keep, port)
	}
	sort.Ints(keep)
	return keep
}
