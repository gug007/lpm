package main

import (
	"fmt"
	"os"
	"syscall"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/portcheck"
)

// PortConflictInfo is the wails-exported representation of a port
// conflict. PID is 0 when the holder isn't identifiable; LpmProject
// is empty for external processes.
type PortConflictInfo struct {
	Service     string `json:"service"`
	Port        int    `json:"port"`
	PID         int    `json:"pid"`
	Process     string `json:"process"`
	LpmProject  string `json:"lpmProject"`
	Description string `json:"description"`
}

func toPortConflictInfo(c portcheck.Conflict) PortConflictInfo {
	return PortConflictInfo{
		Service:     c.Service,
		Port:        c.Port,
		PID:         c.Holder.PID,
		Process:     c.Holder.Command,
		LpmProject:  c.LpmProject,
		Description: c.HolderPhrase(),
	}
}

func toPortConflictInfoList(cs []portcheck.Conflict) []PortConflictInfo {
	out := make([]PortConflictInfo, 0, len(cs))
	for _, c := range cs {
		out = append(out, toPortConflictInfo(c))
	}
	return out
}

// CheckPortConflicts returns the port conflicts that would prevent
// starting the named project with the given profile.
func (a *App) CheckPortConflicts(name, profile string) ([]PortConflictInfo, error) {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return nil, err
	}
	return toPortConflictInfoList(portcheck.Check(cfg, cfg.ServicesForProfile(profile))), nil
}

// CheckPortConflictsForServices is CheckPortConflicts with an explicit
// service list, bypassing profile resolution.
func (a *App) CheckPortConflictsForServices(name string, services []string) ([]PortConflictInfo, error) {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return nil, err
	}
	return toPortConflictInfoList(portcheck.Check(cfg, services)), nil
}

// ResolvePortConflict releases the port held by the conflict's owner.
// Lpm projects are stopped via StopProject; external PIDs receive
// SIGTERM and are given up to ~5s to release the port. The function
// returns an error when the port is still bound after the grace period.
func (a *App) ResolvePortConflict(c PortConflictInfo) error {
	if c.LpmProject != "" {
		if err := a.StopProject(c.LpmProject); err != nil {
			return fmt.Errorf("stop %q: %w", c.LpmProject, err)
		}
	} else {
		if c.PID <= 0 {
			return fmt.Errorf("no process identified for port %d", c.Port)
		}
		proc, err := os.FindProcess(c.PID)
		if err != nil {
			return fmt.Errorf("find PID %d: %w", c.PID, err)
		}
		if err := proc.Signal(syscall.SIGTERM); err != nil {
			return fmt.Errorf("SIGTERM PID %d: %w", c.PID, err)
		}
	}
	return waitPortFree(c.Port, 5*time.Second)
}

// waitPortFree polls until the port can accept a new TCP listener or
// the deadline passes. Bind probe is sufficient here: we already know
// the holder (we just SIGTERM'd it), so we don't need lsof to attribute.
func waitPortFree(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if portcheck.CanBind(port) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("port %d still in use after %s", port, timeout)
}
