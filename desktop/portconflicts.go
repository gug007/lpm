package main

import (
	"fmt"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/portcheck"
)

// PortConflictInfo: PID=0 when the holder isn't identifiable; LpmProject
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

func (a *App) CheckPortConflicts(name, profile string) ([]PortConflictInfo, error) {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return nil, err
	}
	return toPortConflictInfoList(portcheck.Check(cfg, cfg.ServicesForProfile(profile))), nil
}

func (a *App) CheckPortConflictsForServices(name string, services []string) ([]PortConflictInfo, error) {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return nil, err
	}
	return toPortConflictInfoList(portcheck.Check(cfg, services)), nil
}

func (a *App) CheckActionPortConflict(projectName, actionName string) ([]PortConflictInfo, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return nil, err
	}
	action, ok := cfg.ResolvedAction(actionName)
	if !ok {
		return nil, fmt.Errorf("action %q not found in project %q", actionName, projectName)
	}
	return toPortConflictInfoList(portcheck.CheckActionPort(actionName, action.Port)), nil
}

func (a *App) ResolvePortConflict(c PortConflictInfo) error {
	return portcheck.FreePort(c.Port, a.StopProject)
}
