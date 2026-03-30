package main

import (
	"context"
	"fmt"
	"os"
	"sort"
	"sync"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

type App struct {
	ctx context.Context

	// sessionCache avoids re-reading and parsing YAML on every
	// GetServiceLogs call (which fires every 1s per pane).
	sessionMu    sync.RWMutex
	sessionCache map[string]string // projectName -> session name
}

func NewApp() *App {
	return &App{
		sessionCache: make(map[string]string),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) SetDarkMode(dark bool) {
	if dark {
		runtime.WindowSetDarkTheme(a.ctx)
	} else {
		runtime.WindowSetLightTheme(a.ctx)
	}
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

func (a *App) SaveConfig(name string, content string) error {
	var test config.ProjectConfig
	if err := yaml.Unmarshal([]byte(content), &test); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}

	path := config.ProjectPath(name)
	mode := os.FileMode(0644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode()
	}
	a.invalidateSessionCache(name)
	return os.WriteFile(path, []byte(content), mode)
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
