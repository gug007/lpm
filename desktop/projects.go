package main

import (
	"fmt"
	"os"
	"sort"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

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

	// Apply saved ordering
	names = a.applyProjectOrder(names)

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

func (a *App) applyProjectOrder(names []string) []string {
	a.cacheMu.RLock()
	order := a.projectOrder
	a.cacheMu.RUnlock()

	if len(order) == 0 {
		return names
	}

	nameSet := make(map[string]bool, len(names))
	for _, n := range names {
		nameSet[n] = true
	}

	ordered := make([]string, 0, len(names))
	for _, n := range order {
		if nameSet[n] {
			ordered = append(ordered, n)
			delete(nameSet, n)
		}
	}
	for _, n := range names {
		if nameSet[n] {
			ordered = append(ordered, n)
		}
	}
	return ordered
}

func (a *App) ReorderProjects(order []string) error {
	a.cacheMu.RLock()
	current := a.projectOrder
	a.cacheMu.RUnlock()

	if slices.Equal(current, order) {
		return nil
	}

	settings := a.LoadSettings()
	settings.ProjectOrder = order
	if err := a.SaveSettings(settings); err != nil {
		return err
	}
	a.cacheMu.Lock()
	a.projectOrder = order
	a.cacheMu.Unlock()
	return nil
}

func (a *App) StartProject(name, profile string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	a.invalidateSessionCache(name)
	return tmux.StartProject(cfg, profile)
}

func (a *App) StopProject(name string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	a.invalidateSessionCache(name)
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
	a.cacheMu.RLock()
	if s, ok := a.sessionCache[projectName]; ok {
		a.cacheMu.RUnlock()
		return s
	}
	a.cacheMu.RUnlock()

	s := config.SessionName(projectName)
	a.cacheMu.Lock()
	a.sessionCache[projectName] = s
	a.cacheMu.Unlock()
	return s
}

func (a *App) cachedPaneIDs(session string) []string {
	a.cacheMu.RLock()
	if ids, ok := a.paneCache[session]; ok {
		a.cacheMu.RUnlock()
		return ids
	}
	a.cacheMu.RUnlock()

	ids := tmux.ListPaneIDs(session)
	a.cacheMu.Lock()
	a.paneCache[session] = ids
	a.cacheMu.Unlock()
	return ids
}

func (a *App) invalidateSessionCache(projectName string) {
	a.cacheMu.Lock()
	session := a.sessionCache[projectName]
	delete(a.sessionCache, projectName)
	delete(a.paneCache, session)
	a.cacheMu.Unlock()
}

func (a *App) GetServiceLogs(projectName string, paneIndex int, lines int) (string, error) {
	session := a.cachedSessionName(projectName)
	panes := a.cachedPaneIDs(session)
	if paneIndex >= len(panes) {
		return "", fmt.Errorf("pane index %d out of range", paneIndex)
	}
	return tmux.CapturePaneByID(panes[paneIndex], lines)
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
