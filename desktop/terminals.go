package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
)

// TerminalEntry is one row of the per-project persisted terminal list.
// StartCmd is the command typed into the shell on first launch; ResumeCmd
// is typed on app-restart restore in place of StartCmd when it is set.
// Both are the fully resolved strings (with any session ids already baked
// in), so restoring a terminal never re-runs the registry resolver.
type TerminalEntry struct {
	Label     string `json:"label"`
	StartCmd  string `json:"startCmd,omitempty"`
	ResumeCmd string `json:"resumeCmd,omitempty"`
}

type ProjectTerminalState struct {
	DetailView string          `json:"detailView"`
	ActiveTab  string          `json:"activeTab,omitempty"`
	Terminals  []TerminalEntry `json:"terminals,omitempty"`
}

type TerminalsConfig struct {
	Projects map[string]ProjectTerminalState `json:"projects"`
}

func terminalsPath() string {
	return filepath.Join(config.LpmDir(), "terminals.json")
}

func (a *App) LoadTerminals() TerminalsConfig {
	data, err := os.ReadFile(terminalsPath())
	if err != nil {
		return TerminalsConfig{Projects: map[string]ProjectTerminalState{}}
	}
	var c TerminalsConfig
	if err := json.Unmarshal(data, &c); err != nil {
		return TerminalsConfig{Projects: map[string]ProjectTerminalState{}}
	}
	if c.Projects == nil {
		c.Projects = map[string]ProjectTerminalState{}
	}
	return c
}

func (a *App) SaveTerminals(c TerminalsConfig) error {
	if err := config.EnsureDirs(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(terminalsPath(), data, 0644)
}
