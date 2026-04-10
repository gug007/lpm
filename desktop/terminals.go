package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
)

// PersistedTab is one terminal saved inside a pane. StartCmd/ResumeCmd are
// re-injected on restore; the PTY id is not persisted (it doesn't survive
// a restart).
type PersistedTab struct {
	Label     string `json:"label"`
	StartCmd  string `json:"startCmd,omitempty"`
	ResumeCmd string `json:"resumeCmd,omitempty"`
}

// PaneNode is one node of a persisted pane layout tree. Leaves have
// Kind="leaf" and carry Tabs/ActiveTabIdx; splits have Kind="split" with
// Direction ("row"|"col"), Ratio, and two children.
type PaneNode struct {
	Kind              string         `json:"kind"`
	Tabs              []PersistedTab `json:"tabs,omitempty"`
	ActiveTabIdx      int            `json:"activeTabIdx,omitempty"`
	ActiveServiceName string         `json:"activeServiceName,omitempty"`
	Direction         string         `json:"direction,omitempty"`
	Ratio             float64        `json:"ratio,omitempty"`
	A                 *PaneNode      `json:"a,omitempty"`
	B                 *PaneNode      `json:"b,omitempty"`
}

// TerminalEntry is the legacy pre-pane-tree flat list entry. Still loaded
// by the frontend for one-time migration into the new pane tree on first
// save — but never written back.
type TerminalEntry struct {
	Label     string `json:"label"`
	StartCmd  string `json:"startCmd,omitempty"`
	ResumeCmd string `json:"resumeCmd,omitempty"`
}

type ProjectTerminalState struct {
	DetailView string          `json:"detailView"`
	ActiveTab  string          `json:"activeTab,omitempty"`
	Panes      *PaneNode       `json:"panes,omitempty"`
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
