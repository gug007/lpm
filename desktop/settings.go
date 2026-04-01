package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
)

type Settings struct {
	Theme             string            `json:"theme"`
	DoubleClickToggle bool              `json:"doubleClickToToggle"`
	ProjectOrder      []string          `json:"projectOrder,omitempty"`
	LastUpdateCheck   string            `json:"lastUpdateCheck,omitempty"`
	TerminalThemes    map[string]string `json:"terminalThemes,omitempty"`
	TerminalFontSize  int               `json:"terminalFontSize,omitempty"`
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

func (a *App) SaveSettings(s Settings) error {
	if err := config.EnsureDirs(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath(), data, 0644)
}
