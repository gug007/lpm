// Package portcheck detects local TCP port conflicts before lpm starts
// a project's services. Self-conflicts (the holder belongs to the
// project being restarted) are filtered out — the existing session is
// killed before the new one launches.
package portcheck

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"
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

// HolderPhrase returns the holder identity as a noun phrase, e.g.
// `lpm project "frontend"` or `node (PID 1234)`.
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

// Probe returns the listener for the given TCP port and whether the
// port is taken. lsof identifies the holder (including listeners using
// SO_REUSEPORT, which a bind probe alone can miss on macOS); CanBind
// catches the rare case where lsof is unavailable.
func Probe(port int) (Holder, bool) {
	if h, ok := lookupHolders([]int{port})[port]; ok {
		return h, true
	}
	if !CanBind(port) {
		return Holder{}, true
	}
	return Holder{}, false
}

// CanBind reports whether 127.0.0.1:port is free for a new TCP listener
// under Go's default REUSEADDR semantics. False positives are possible
// with foreign listeners that hold the port via SO_REUSEPORT — pair
// with Probe when that distinction matters.
func CanBind(port int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	_ = l.Close()
	return true
}

// Check returns the conflicts that would prevent starting the given
// services in cfg. Conflicts caused by the project's own currently-
// running session are filtered out. SSH projects bind on the remote host
// and are skipped — the local host's ports are irrelevant.
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

// Format returns an error describing the conflicts as a multi-line,
// actionable message. Returns nil when there are no conflicts.
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

// lookupHolders queries lsof once for the given ports and returns a
// map of port → holder. Empty when lsof is missing, fails, or finds
// no listeners. Each `-iTCP:N` adds an OR clause so we get all matches
// in a single subprocess.
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

// parseLsof reads `lsof -F pcn` output. Each process record begins with
// `pPID` and `cCOMMAND`, then one or more `nADDR:PORT` lines per matched
// file. The first holder seen for each port wins.
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

// portFromAddr extracts the port from an lsof `n` field, which has the
// shape `addr:port` — e.g. `*:3000`, `127.0.0.1:8080`, `[::1]:443`.
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

// lpmPaneIndex maps each tmux pane shell PID to the lpm project whose
// session contains that pane. Used to attribute a port conflict to a
// sibling project rather than a stray external process.
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

// processParents reads the entire process table once and returns a
// pid → ppid map. Avoids one `ps` invocation per ancestor step in
// walkToProject.
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

// walkToProject walks pid's parent chain and returns the first lpm
// project found in paneIdx. Empty when pid (or its ancestors) don't
// belong to any tracked tmux pane.
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
