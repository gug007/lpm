package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

var Version = "0.1.9"

type Settings struct {
	Theme              string `json:"theme"`
	DoubleClickToggle  bool   `json:"doubleClickToToggle"`
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

type App struct {
	ctx context.Context

	// sessionCache avoids re-reading and parsing YAML on every
	// GetServiceLogs call (which fires every 1s per pane).
	sessionMu    sync.RWMutex
	sessionCache map[string]string // projectName -> session name

	pendingDownloadURL string // set by CheckForUpdate, used by InstallUpdate
}

func NewApp() *App {
	return &App{
		sessionCache: make(map[string]string),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if err := tmux.EnsureInstalled(); err != nil {
		sel, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:          runtime.QuestionDialog,
			Title:         "tmux not found",
			Message:       "tmux is required but not installed.\n\nWould you like to install it now via Homebrew?",
			Buttons:       []string{"Install", "Cancel"},
			DefaultButton: "Install",
			CancelButton:  "Cancel",
		})
		if sel == "Install" {
			a.installTmux()
		}
	}
}

func (a *App) installTmux() {
	brewPath, err := exec.LookPath("brew")
	if err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Homebrew not found",
			Message: "Homebrew is required to install tmux.\n\nInstall it from https://brew.sh and relaunch the app.",
		})
		return
	}

	cmd := exec.Command(brewPath, "install", "tmux")
	if out, err := cmd.CombinedOutput(); err != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Installation failed",
			Message: fmt.Sprintf("Failed to install tmux:\n\n%s", string(out)),
		})
		return
	}

	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   "tmux installed",
		Message: "tmux was installed successfully.",
	})
}

func (a *App) SetDarkMode(dark bool) {
	if dark {
		runtime.WindowSetDarkTheme(a.ctx)
	} else {
		runtime.WindowSetLightTheme(a.ctx)
	}
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

type ProjectInfo struct {
	Name     string        `json:"name"`
	Session  string        `json:"session"`
	Root     string        `json:"root"`
	Running  bool          `json:"running"`
	Services []ServiceInfo `json:"services"`
	Profiles []string      `json:"profiles"`
}

type ServiceInfo struct {
	Name string `json:"name"`
	Cmd  string `json:"cmd"`
	Cwd  string `json:"cwd"`
	Port int    `json:"port"`
}

func toProjectInfo(name string, cfg *config.ProjectConfig, running bool) ProjectInfo {
	serviceNames := cfg.ServicesForProfile("")
	services := make([]ServiceInfo, 0, len(serviceNames))
	for _, svcName := range serviceNames {
		svc := cfg.Services[svcName]
		services = append(services, ServiceInfo{
			Name: svcName,
			Cmd:  svc.Cmd,
			Cwd:  svc.Cwd,
			Port: svc.Port,
		})
	}

	profiles := make([]string, 0, len(cfg.Profiles))
	for pName := range cfg.Profiles {
		profiles = append(profiles, pName)
	}
	sort.Strings(profiles)

	return ProjectInfo{
		Name:     name,
		Session:  cfg.Name,
		Root:     cfg.Root,
		Running:  running,
		Services: services,
		Profiles: profiles,
	}
}

func (a *App) ListProjects() ([]ProjectInfo, error) {
	names, err := config.ListProjects()
	if err != nil {
		return nil, err
	}

	sessions := tmux.ListSessions()
	projects := make([]ProjectInfo, 0, len(names))

	for _, name := range names {
		cfg, err := config.LoadProject(name)
		if err != nil {
			continue
		}
		projects = append(projects, toProjectInfo(name, cfg, sessions[cfg.Name]))
	}

	return projects, nil
}

func (a *App) StartProject(name, profile string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	return tmux.StartProject(cfg, profile)
}

func (a *App) StopProject(name string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	return tmux.KillSession(cfg.Name)
}

func (a *App) StopAll() error {
	names, err := config.ListProjects()
	if err != nil {
		return err
	}
	for _, name := range names {
		if cfg, err := config.LoadProject(name); err == nil {
			tmux.KillSession(cfg.Name)
		}
	}
	return nil
}

func (a *App) GetProject(name string) (*ProjectInfo, error) {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return nil, err
	}
	running := tmux.SessionExists(cfg.Name)
	info := toProjectInfo(name, cfg, running)
	return &info, nil
}

func (a *App) cachedSessionName(projectName string) string {
	a.sessionMu.RLock()
	if s, ok := a.sessionCache[projectName]; ok {
		a.sessionMu.RUnlock()
		return s
	}
	a.sessionMu.RUnlock()

	s := config.SessionName(projectName)
	a.sessionMu.Lock()
	a.sessionCache[projectName] = s
	a.sessionMu.Unlock()
	return s
}

func (a *App) invalidateSessionCache(projectName string) {
	a.sessionMu.Lock()
	delete(a.sessionCache, projectName)
	a.sessionMu.Unlock()
}

func (a *App) GetServiceLogs(projectName string, paneIndex int, lines int) (string, error) {
	session := a.cachedSessionName(projectName)
	return tmux.CapturePaneLogs(session, paneIndex, lines)
}

func (a *App) ReadConfig(name string) (string, error) {
	path := config.ProjectPath(name)
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SaveConfig returns the new project name (may differ from input if name: field changed).
func (a *App) SaveConfig(name string, content string) (string, error) {
	var parsed config.ProjectConfig
	if err := yaml.Unmarshal([]byte(content), &parsed); err != nil {
		return "", fmt.Errorf("invalid YAML: %w", err)
	}

	oldPath := config.ProjectPath(name)
	mode := os.FileMode(0644)
	if info, err := os.Stat(oldPath); err == nil {
		mode = info.Mode()
	}

	newName := parsed.Name
	if newName == "" {
		newName = name
	}

	if newName != name {
		if err := config.ValidateName(newName); err != nil {
			return "", err
		}
		newPath := config.ProjectPath(newName)
		if _, err := os.Stat(newPath); err == nil {
			return "", fmt.Errorf("project %q already exists", newName)
		}
		if err := os.WriteFile(newPath, []byte(content), mode); err != nil {
			return "", err
		}
		os.Remove(oldPath)
		a.invalidateSessionCache(name)
		return newName, nil
	}

	a.invalidateSessionCache(name)
	return name, os.WriteFile(oldPath, []byte(content), mode)
}

func (a *App) CreateProject(name string, root string) error {
	if err := config.ValidateName(name); err != nil {
		return err
	}
	path := config.ProjectPath(name)
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("project %q already exists", name)
	}
	cfg := &config.ProjectConfig{
		Name:     name,
		Root:     root,
		Services: map[string]config.Service{"dev": {Cmd: "echo 'configure me'"}},
	}
	return config.SaveProject(cfg)
}

func (a *App) BrowseFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select project folder",
	})
}

func (a *App) RemoveProject(name string) error {
	if cfg, err := config.LoadProject(name); err == nil {
		tmux.KillSession(cfg.Name)
	}
	a.invalidateSessionCache(name)
	return os.Remove(config.ProjectPath(name))
}

type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	UpdateAvail    bool   `json:"updateAvail"`
}

func (a *App) GetVersion() string {
	return Version
}

// versionNewer returns true if latest is strictly newer than current (both "major.minor.patch").
func versionNewer(latest, current string) bool {
	parse := func(v string) [3]int {
		var parts [3]int
		for i, s := range strings.SplitN(v, ".", 3) {
			parts[i], _ = strconv.Atoi(s)
		}
		return parts
	}
	l, c := parse(latest), parse(current)
	if l[0] != c[0] {
		return l[0] > c[0]
	}
	if l[1] != c[1] {
		return l[1] > c[1]
	}
	return l[2] > c[2]
}

func (a *App) CheckForUpdate() (*UpdateInfo, error) {
	resp, err := httpClient.Get("https://api.github.com/repos/gug007/lpm/releases/latest")
	if err != nil {
		return nil, fmt.Errorf("failed to check for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	current := strings.TrimPrefix(Version, "v")

	// Find the DMG asset matching current architecture
	suffix := fmt.Sprintf("macos-%s.dmg", goruntime.GOARCH)
	a.pendingDownloadURL = ""
	for _, asset := range release.Assets {
		if strings.HasSuffix(asset.Name, suffix) {
			a.pendingDownloadURL = asset.BrowserDownloadURL
			break
		}
	}

	return &UpdateInfo{
		CurrentVersion: current,
		LatestVersion:  latest,
		UpdateAvail:    versionNewer(latest, current),
	}, nil
}

func appBundlePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	// Walk up from e.g. /Applications/lpm.app/Contents/MacOS/lpm-desktop
	for dir := filepath.Dir(exe); dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if strings.HasSuffix(dir, ".app") {
			return dir, nil
		}
	}
	return "", fmt.Errorf("could not determine .app bundle path from %s", exe)
}

func (a *App) InstallUpdate() error {
	if a.pendingDownloadURL == "" {
		return fmt.Errorf("no update available — check for updates first")
	}

	appPath, err := appBundlePath()
	if err != nil {
		return err
	}
	appDir := filepath.Dir(appPath)

	// Download DMG to temp file
	tmpFile, err := os.CreateTemp("", "lpm-update-*.dmg")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	dmgPath := tmpFile.Name()
	defer os.Remove(dmgPath)
	defer tmpFile.Close()

	dlClient := &http.Client{Timeout: 5 * time.Minute}
	resp, err := dlClient.Get(a.pendingDownloadURL)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		return fmt.Errorf("failed to save update: %w", err)
	}
	tmpFile.Close()

	// Mount DMG to a known temp path
	mountPoint, err := os.MkdirTemp("", "lpm-mount-*")
	if err != nil {
		return fmt.Errorf("failed to create mount dir: %w", err)
	}
	defer os.Remove(mountPoint)

	if out, err := exec.Command("hdiutil", "attach", dmgPath, "-nobrowse", "-mountpoint", mountPoint).CombinedOutput(); err != nil {
		return fmt.Errorf("failed to mount DMG: %s", string(out))
	}
	defer exec.Command("hdiutil", "detach", mountPoint, "-quiet").Run()

	// Find .app inside mounted volume
	entries, err := os.ReadDir(mountPoint)
	if err != nil {
		return fmt.Errorf("failed to read mounted DMG: %w", err)
	}
	var newAppName string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".app") {
			newAppName = e.Name()
			break
		}
	}
	if newAppName == "" {
		return fmt.Errorf("no .app found in DMG")
	}

	srcApp := filepath.Join(mountPoint, newAppName)
	dstApp := filepath.Join(appDir, newAppName)

	// Copy new app to a staging path, then atomically swap
	stagingApp := dstApp + ".new"
	os.RemoveAll(stagingApp)
	if out, err := exec.Command("ditto", srcApp, stagingApp).CombinedOutput(); err != nil {
		os.RemoveAll(stagingApp)
		return fmt.Errorf("failed to copy new app: %s", string(out))
	}
	if err := os.RemoveAll(dstApp); err != nil {
		os.RemoveAll(stagingApp)
		return fmt.Errorf("failed to remove old app: %w", err)
	}
	if err := os.Rename(stagingApp, dstApp); err != nil {
		return fmt.Errorf("failed to finalize update: %w", err)
	}

	// Cleanup explicitly before quit (defers may not run after Quit)
	exec.Command("hdiutil", "detach", mountPoint, "-quiet").Run()
	os.Remove(dmgPath)

	exec.Command("open", "-n", dstApp).Start()
	runtime.Quit(a.ctx)

	return nil
}
