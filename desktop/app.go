package main

import (
	"context"
	"fmt"
	"os"
	"sort"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
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
	return os.WriteFile(path, []byte(content), mode)
}

func (a *App) RemoveProject(name string) error {
	if cfg, err := config.LoadProject(name); err == nil {
		tmux.KillSession(cfg.Name)
	}
	return os.Remove(config.ProjectPath(name))
}
