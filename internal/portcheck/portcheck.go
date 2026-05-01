// Package portcheck detects local TCP port conflicts before lpm starts
// services or runs port-bound actions.
package portcheck

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gug007/lpm/internal/config"
)

type Holder struct {
	PID     int
	Command string
}

type Conflict struct {
	Service    string
	Port       int
	Holder     Holder
	LpmProject string
}

func (c Conflict) HolderPhrase() string {
	switch {
	case c.LpmProject != "":
		return fmt.Sprintf("lpm project %q", c.LpmProject)
	case c.Holder.PID > 0 && c.Holder.Command != "":
		return fmt.Sprintf("%s (PID %d)", c.Holder.Command, c.Holder.PID)
	case c.Holder.PID > 0:
		return fmt.Sprintf("PID %d", c.Holder.PID)
	default:
		return "an unknown local process"
	}
}

// Probe falls back to CanBind when lsof is unavailable. lsof is needed
// to catch SO_REUSEPORT listeners that a bind probe alone misses on macOS.
func Probe(port int) (Holder, bool) {
	if h, ok := lookupHolders([]int{port})[port]; ok {
		return h, true
	}
	if !CanBind(port) {
		return Holder{}, true
	}
	return Holder{}, false
}

// CanBind can return true even when something is listening with
// SO_REUSEPORT on macOS; pair with Probe when that distinction matters.
func CanBind(port int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = l.Close()
	return true
}

// FreePort delegates to stopLpmProject for lpm-owned holders so the
// caller can perform side cleanup (state caches, event emits); external
// PIDs receive SIGTERM directly.
func FreePort(port int, stopLpmProject func(string) error) error {
	if port <= 0 {
		return nil
	}
	holder, taken := Probe(port)
	if !taken {
		return nil
	}
	project := walkToProject(holder.PID, lpmPaneIndex(), processParents())

	switch {
	case project != "":
		if stopLpmProject == nil {
			return fmt.Errorf("port %d held by lpm project %q (no stopper provided)", port, project)
		}
		if err := stopLpmProject(project); err != nil {
			return fmt.Errorf("stop lpm project %q: %w", project, err)
		}
	case holder.PID > 0:
		proc, err := os.FindProcess(holder.PID)
		if err != nil {
			return fmt.Errorf("find PID %d: %w", holder.PID, err)
		}
		if err := proc.Signal(syscall.SIGTERM); err != nil {
			return fmt.Errorf("SIGTERM PID %d: %w", holder.PID, err)
		}
	default:
		return fmt.Errorf("port %d held by an unidentifiable process", port)
	}
	return waitBindable(port, freePortGrace)
}

const freePortGrace = 5 * time.Second

func waitBindable(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if CanBind(port) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("port %d still in use after %s", port, timeout)
}

// Check filters out self-conflicts (StartProjectServices kills the
// existing session before launching the new one) and skips SSH projects
// (they bind on the remote, not locally).
func Check(cfg *config.ProjectConfig, serviceNames []string) []Conflict {
	if cfg == nil || cfg.IsRemote() {
		return nil
	}
	type want struct {
		service string
		port    int
	}
	var wants []want
	var ports []int
	for _, name := range serviceNames {
		svc, ok := cfg.Services[name]
		if !ok || svc.Port <= 0 {
			continue
		}
		wants = append(wants, want{name, svc.Port})
		ports = append(ports, svc.Port)
	}
	if len(wants) == 0 {
		return nil
	}

	holders := lookupHolders(ports)
	var paneIdx map[int]string
	var parents map[int]int
	indexed := false

	var conflicts []Conflict
	for _, w := range wants {
		holder, taken := holders[w.port]
		if !taken && !CanBind(w.port) {
			taken = true
		}
		if !taken {
			continue
		}
		if !indexed {
			paneIdx = lpmPaneIndex()
			parents = processParents()
			indexed = true
		}
		project := walkToProject(holder.PID, paneIdx, parents)
		if project == cfg.Name {
			continue
		}
		conflicts = append(conflicts, Conflict{
			Service:    w.service,
			Port:       w.port,
			Holder:     holder,
			LpmProject: project,
		})
	}
	return conflicts
}

func FormatActionPort(actionName string, port int) error {
	return Format(CheckActionPort(actionName, port))
}

// CheckActionPort never skips self-conflicts (unlike Check, since
// actions have no "self-restart" semantics).
func CheckActionPort(actionName string, port int) []Conflict {
	if port <= 0 {
		return nil
	}
	holder, taken := Probe(port)
	if !taken {
		return nil
	}
	project := walkToProject(holder.PID, lpmPaneIndex(), processParents())
	return []Conflict{{
		Service:    actionName,
		Port:       port,
		Holder:     holder,
		LpmProject: project,
	}}
}

func Format(conflicts []Conflict) error {
	if len(conflicts) == 0 {
		return nil
	}
	var b strings.Builder
	b.WriteString("port conflict")
	if len(conflicts) > 1 {
		b.WriteByte('s')
	}
	for _, c := range conflicts {
		fmt.Fprintf(&b, "\n  • %d (%s) — used by %s", c.Port, c.Service, c.HolderPhrase())
		switch {
		case c.LpmProject != "":
			fmt.Fprintf(&b, " (run: lpm kill %s)", c.LpmProject)
		case c.Holder.PID > 0:
			fmt.Fprintf(&b, " (run: kill %d)", c.Holder.PID)
		}
	}
	return errors.New(b.String())
}

// lookupHolders batches all ports into one lsof call (each `-iTCP:N`
// adds an OR clause).
func lookupHolders(ports []int) map[int]Holder {
	if len(ports) == 0 {
		return nil
	}
	args := make([]string, 0, 3+len(ports))
	args = append(args, "-nP")
	for _, p := range ports {
		args = append(args, "-iTCP:"+strconv.Itoa(p))
	}
	args = append(args, "-sTCP:LISTEN", "-Fpcn")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// lsof exits 1 when any -i filter has no match, even when others
	// produced output. Ignoring the error keeps the partial matches.
	out, _ := exec.CommandContext(ctx, "lsof", args...).Output()
	if len(out) == 0 {
		return nil
	}
	return parseLsof(string(out))
}

// parseLsof reads `lsof -F pcn` field-prefixed output: `pPID` then
// `cCOMMAND` then one or more `nADDR:PORT` lines per matched file.
func parseLsof(s string) map[int]Holder {
	result := map[int]Holder{}
	var current Holder
	for _, line := range strings.Split(s, "\n") {
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			if pid, err := strconv.Atoi(line[1:]); err == nil {
				current = Holder{PID: pid}
			}
		case 'c':
			current.Command = line[1:]
		case 'n':
			port, ok := portFromAddr(line[1:])
			if !ok || current.PID <= 0 {
				continue
			}
			if _, exists := result[port]; !exists {
				result[port] = current
			}
		}
	}
	return result
}

func portFromAddr(addr string) (int, bool) {
	i := strings.LastIndex(addr, ":")
	if i < 0 {
		return 0, false
	}
	p, err := strconv.Atoi(addr[i+1:])
	if err != nil {
		return 0, false
	}
	return p, true
}

func lpmPaneIndex() map[int]string {
	idx := map[int]string{}
	out, err := exec.Command("tmux", "list-panes", "-a", "-F", "#{pane_pid} #{session_name}").Output()
	if err != nil {
		return idx
	}
	sessionToProject := map[string]string{}
	if names, err := config.ListProjects(); err == nil {
		for _, name := range names {
			sessionToProject[config.SessionName(name)] = name
		}
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		if project, ok := sessionToProject[fields[1]]; ok {
			idx[pid] = project
		}
	}
	return idx
}

// processParents bulk-reads the table so walkToProject doesn't spawn a
// `ps` per ancestor.
func processParents() map[int]int {
	out, err := exec.Command("ps", "-e", "-o", "pid=,ppid=").Output()
	if err != nil {
		return nil
	}
	parents := map[int]int{}
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		ppid, err := strconv.Atoi(fields[1])
		if err != nil {
			continue
		}
		parents[pid] = ppid
	}
	return parents
}

func walkToProject(pid int, paneIdx map[int]string, parents map[int]int) string {
	if pid <= 1 || len(paneIdx) == 0 {
		return ""
	}
	cur := pid
	for i := 0; i < 32 && cur > 1; i++ {
		if project, ok := paneIdx[cur]; ok {
			return project
		}
		ppid, ok := parents[cur]
		if !ok {
			return ""
		}
		cur = ppid
	}
	return ""
}
