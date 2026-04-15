package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
)

type Settings struct {
	Theme               string   `json:"theme"`
	DoubleClickToggle   bool     `json:"doubleClickToToggle"`
	SoundNotifications  bool     `json:"soundNotifications,omitempty"`
	ProjectOrder        []string `json:"projectOrder,omitempty"`
	TerminalTheme       string   `json:"terminalTheme,omitempty"`
	TerminalFontSize    int      `json:"terminalFontSize,omitempty"`
	EditorFontSize      int      `json:"editorFontSize,omitempty"`
	WindowWidth         int      `json:"windowWidth,omitempty"`
	WindowHeight        int      `json:"windowHeight,omitempty"`
	SidebarWidth        int      `json:"sidebarWidth,omitempty"`
	AutoGenCommitMsg    bool     `json:"autoGenerateCommitMessage,omitempty"`
	AutoGenPRDesc       bool     `json:"autoGeneratePRDescription,omitempty"`
	AiCli               string   `json:"aiCli,omitempty"`
	AiModel             string   `json:"aiModel,omitempty"`
	ConfigEditorMode    string   `json:"configEditorMode,omitempty"`
	ShowProjectName     *bool    `json:"showProjectName,omitempty"`
	LastSelectedProject string   `json:"lastSelectedProject,omitempty"`
	GitPullStrategy     string   `json:"gitPullStrategy,omitempty"`
}

func defaultSettings() Settings {
	return Settings{
		Theme:             "system",
		DoubleClickToggle: false,
	}
}

func settingsPath() string {
	return filepath.Join(config.LpmDir(), "settings.json")
}

func (a *App) LoadSettings() Settings {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	return a.loadSettingsLocked()
}

func (a *App) SaveSettings(s Settings) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	return a.saveSettingsLocked(s)
}

// loadSettingsLocked reads settings from disk. Caller must hold settingsMu.
func (a *App) loadSettingsLocked() Settings {
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		return defaultSettings()
	}
	s := defaultSettings()
	if err := json.Unmarshal(data, &s); err != nil {
		return defaultSettings()
	}
	return s
}

// saveSettingsLocked writes settings to disk. Caller must hold settingsMu.
func (a *App) saveSettingsLocked(s Settings) error {
	if err := config.EnsureDirs(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath(), data, 0644)
}
