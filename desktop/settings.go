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
	TerminalOpenInDefaultApp bool `json:"terminalOpenInDefaultApp,omitempty"`
	EditorFontSize      int      `json:"editorFontSize,omitempty"`
	WindowWidth         int      `json:"windowWidth,omitempty"`
	WindowHeight        int      `json:"windowHeight,omitempty"`
	SidebarWidth        int      `json:"sidebarWidth,omitempty"`
	AutoGenCommitMsg    bool     `json:"autoGenerateCommitMessage,omitempty"`
	AutoGenPRDesc       bool     `json:"autoGeneratePRDescription,omitempty"`
	AiCli               string   `json:"aiCli,omitempty"`
	AiModel             string   `json:"aiModel,omitempty"`
	AiEffort            string   `json:"aiEffort,omitempty"`
	AiFast              bool     `json:"aiFast,omitempty"`
	ConfigEditorMode    string   `json:"configEditorMode,omitempty"`
	ShowProjectName     *bool    `json:"showProjectName,omitempty"`
	LastSelectedProject string   `json:"lastSelectedProject,omitempty"`
	GitPullStrategy     string   `json:"gitPullStrategy,omitempty"`
	ExperimentalTTS     bool     `json:"experimentalTTS,omitempty"`
	TTSEnabled          bool     `json:"ttsEnabled,omitempty"`
	TTSVoice            string   `json:"ttsVoice,omitempty"`
	TTSSpeed            float64  `json:"ttsSpeed,omitempty"`
	PreferredEditor     string   `json:"preferredEditor,omitempty"`
	// DetachedWindows holds per-project window state for projects that are
	// (or were last) opened in their own window. Bounds persist even after
	// re-attach so re-detaching restores the previous geometry.
	DetachedWindows     map[string]DetachedWindowState `json:"detachedWindows,omitempty"`
}

type DetachedWindowState struct {
	Detached bool `json:"detached"`
	X        int  `json:"x,omitempty"`
	Y        int  `json:"y,omitempty"`
	Width    int  `json:"width,omitempty"`
	Height   int  `json:"height,omitempty"`
}

func defaultSettings() Settings {
	return Settings{
		Theme:             "dark",
		DoubleClickToggle: false,
		TerminalTheme:     "claude-dark",
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

// withSettings runs mutate under settingsMu, persisting only when mutate
// reports a change.
func (a *App) withSettings(mutate func(*Settings) bool) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	s := a.loadSettingsLocked()
	if !mutate(&s) {
		return nil
	}
	return a.saveSettingsLocked(s)
}

func validWindowBounds(width, height int) bool {
	return width >= minWindowWidth && height >= minWindowHeight &&
		width <= maxWindowWidth && height <= maxWindowHeight
}

func (a *App) SaveSettings(s Settings) error {
	a.settingsMu.Lock()
	defer a.settingsMu.Unlock()
	return a.saveSettingsLocked(s)
}

// loadSettingsLocked: caller must hold settingsMu.
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

// saveSettingsLocked: caller must hold settingsMu.
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
