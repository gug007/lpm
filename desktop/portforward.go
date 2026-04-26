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
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Event names emitted to the frontend so all writers/readers share the
// same string and renames stay localised.
const (
	eventPortsChanged      = "ports-changed"
	eventPortAutoForwarded = "port-auto-forwarded"
	eventPortForwardFailed = "port-forward-failed"
)

// portForward is one active `ssh -N -L` tunnel. The cancel func kills
// the underlying ssh process — kept beside the *exec.Cmd so callers
// don't have to know whether ssh exited on its own or was reaped here.
type portForward struct {
	LocalPort  int `json:"localPort"`
	RemotePort int `json:"remotePort"`
	cmd        *exec.Cmd
	cancel     context.CancelFunc
}

// PortForward is the JSON shape returned to the frontend Ports panel.
type PortForward struct {
	LocalPort  int `json:"localPort"`
	RemotePort int `json:"remotePort"`
}

// ListPortForwards returns the active forwards for a project, sorted by
// remote port for stable UI rendering.
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
// tunnel for project. localPort=0 picks a free port. Returns the active
// forward — same fields as ListPortForwards entries — once the local
// listener is reachable. Idempotent on remote port: if one already
// exists, returns it without spawning a second ssh.
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
		if isLocalPortFree(remotePort) {
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

	// Single Wait goroutine: closes exitCh once ssh has actually
	// reaped. Both the readiness check and the lifecycle cleanup
	// goroutine consume this channel — calling Wait twice would panic.
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
		runtime.EventsEmit(a.ctx, eventPortsChanged, project)
	}()

	a.markPortSuggested(project, remotePort)
	runtime.EventsEmit(a.ctx, eventPortsChanged, project)
	return PortForward{LocalPort: localPort, RemotePort: remotePort}, nil
}

// RemovePortForward kills the ssh process for the named local port. No
// error if no such forward exists (matches frontend optimistic removal).
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
	runtime.EventsEmit(a.ctx, eventPortsChanged, project)
	return nil
}

// removePortForward removes a specific forward from the project list.
// Used by the wait goroutine when ssh exits on its own.
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
// resets its suggestion state. Called from RemoveProject and StopProject
// so a stopped/removed project doesn't leak ssh processes or leave a
// stale "N new" badge in the header.
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
	runtime.EventsEmit(a.ctx, eventPortsChanged, project)
}

// stopAllPortForwards kills every forward across every project. Called
// from app shutdown.
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

// isLocalPortFree probes whether nothing is listening on 127.0.0.1:port.
// Used to decide between mirroring the remote port and falling back to
// a randomly-picked one.
func isLocalPortFree(port int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = l.Close()
	return true
}

// waitForLocalListen polls until something accepts on 127.0.0.1:port.
// Returns early when exitCh closes — that signals ssh exited before
// the local listener came up (auth failure, port-in-use, etc.) and
// the caller's stderr buffer holds the real reason.
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

// localhostURLPattern matches the URL forms common dev servers print on
// startup: vite, next, rails, django, etc. Captures the port so we can
// suggest forwarding it. 0.0.0.0 covers servers bound to all interfaces.
var localhostURLPattern = regexp.MustCompile(`https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b`)

// ansiCSIPattern matches the CSI escape sequences (color, cursor, etc.)
// common dev servers wrap their startup output in. Stripping them
// before regex matching lets `http://\x1b[36mlocalhost\x1b[39m:3000`
// from chalk-formatted lines still match.
var ansiCSIPattern = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)

// sniffPortsFromOutput scans terminal output for localhost URLs and
// records each new one as a suggestion. Only fires for remote SSH
// projects — local projects don't need forwarding. The "://" prefilter
// skips the regex passes on the vast majority of flushes (a busy
// compiler can flush every few ms).
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

// observePort is the single entry point for both URL-sniff and remote-
// poll discoveries. It applies the dedup-and-dismiss filter and then
// either auto-forwards (when the port is in the project's declared
// `services:` set) or surfaces a click-to-forward suggestion.
// Callers pass declared instead of having observePort load the project
// config, so a burst of detections doesn't re-read YAML per port.
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

	runtime.EventsEmit(a.ctx, eventPortsChanged, project)
}

// autoForward opens a tunnel without user interaction and pushes a
// toast event so the user still sees what was wired up. Declared
// service ports take this path; everything else surfaces a suggestion
// for explicit confirmation.
func (a *App) autoForward(project string, remotePort int) {
	pf, err := a.AddPortForward(project, remotePort, 0)
	if err != nil {
		runtime.EventsEmit(a.ctx, eventPortForwardFailed, map[string]any{
			"project":    project,
			"remotePort": remotePort,
			"error":      err.Error(),
		})
		return
	}
	runtime.EventsEmit(a.ctx, eventPortAutoForwarded, map[string]any{
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
// Called when an explicit user action (e.g. AddPortForward) implies
// the port has already been "discovered."
func (a *App) markPortSuggested(project string, port int) {
	a.suggestedMu.Lock()
	defer a.suggestedMu.Unlock()
	if a.suggested[project] == nil {
		a.suggested[project] = make(map[int]bool)
	}
	a.suggested[project][port] = true
}

// preDismissPort silently records a port as dismissed without
// surfacing it to the user. Used by the poller's baseline pass to
// suppress ambient pre-existing listeners (databases, alt-ssh, system
// daemons) so only ports opened *after* polling started get suggested.
func (a *App) preDismissPort(project string, port int) {
	a.suggestedMu.Lock()
	defer a.suggestedMu.Unlock()
	if a.dismissed[project] == nil {
		a.dismissed[project] = make(map[int]bool)
	}
	a.dismissed[project][port] = true
}

// pruneSuggestionsForPort drops suggested ports that are no longer
// listening on the remote and returns true when anything changed.
// Without this the suggested set grows monotonically over a long
// session as services come and go. Dismissed state is intentionally
// kept — the user's "no" should outlast a service restart.
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

// DismissPortSuggestion is called by the frontend when the user closes
// the suggestion toast without forwarding. The port is added to the
// dismissed set so subsequent observations stay quiet, and removed from
// the suggested view so the popover stops listing it.
func (a *App) DismissPortSuggestion(project string, port int) {
	a.suggestedMu.Lock()
	if a.dismissed[project] == nil {
		a.dismissed[project] = make(map[int]bool)
	}
	a.dismissed[project][port] = true
	a.suggestedMu.Unlock()
	runtime.EventsEmit(a.ctx, eventPortsChanged, project)
}

// ClearPortSuggestions dismisses every currently-suggested port for a
// project — used by the popover's "Clear" button when the noise from
// pre-existing services already piled up before the baseline filter
// was in place.
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
	runtime.EventsEmit(a.ctx, eventPortsChanged, project)
}

// GetSuggestedPorts returns the ports we've detected on the remote that
// are not currently forwarded and haven't been dismissed. The popover
// queries this on open so it can render pending suggestions even when
// the toast was lost (e.g. emitted before the listener mounted).
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
