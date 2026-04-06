package main

import (
	"fmt"
	"os"
	"slices"
	"sort"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

type ProjectInfo struct {
	Name              string               `json:"name"`
	Session           string               `json:"session"`
	Root              string               `json:"root"`
	Running           bool                 `json:"running"`
	Services          []ServiceInfo        `json:"services"`
	Actions           []ActionInfo         `json:"actions"`
	Terminals         []TerminalConfigInfo `json:"terminals"`
	Profiles          []string             `json:"profiles"`
	ActiveProfile     string               `json:"activeProfile"`
	StatusEntries []StatusEntry `json:"statusEntries"`
}

type ServiceInfo struct {
	Name string `json:"name"`
	Cmd  string `json:"cmd"`
	Cwd  string `json:"cwd"`
	Port int    `json:"port"`
}

type ActionInfo struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	Confirm bool   `json:"confirm"`
	Display string `json:"display"`
}

type TerminalConfigInfo struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	Cmd     string `json:"cmd"`
	Display string `json:"display"`
}

func toProjectInfo(name string, cfg *config.ProjectConfig, running bool, activeProfile string) ProjectInfo {
	serviceNames := cfg.ServicesForProfile(activeProfile)
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

	actionNames := make([]string, 0, len(cfg.Actions))
	for aName := range cfg.Actions {
		actionNames = append(actionNames, aName)
	}
	sort.Strings(actionNames)

	actions := make([]ActionInfo, 0, len(actionNames))
	for _, aName := range actionNames {
		act := cfg.Actions[aName]
		label := act.Label
		if label == "" {
			label = aName
		}
		actions = append(actions, ActionInfo{
			Name:    aName,
			Label:   label,
			Confirm: act.Confirm,
			Display: act.Display,
		})
	}

	termNames := make([]string, 0, len(cfg.Terminals))
	for tName := range cfg.Terminals {
		termNames = append(termNames, tName)
	}
	sort.Strings(termNames)

	terminalConfigs := make([]TerminalConfigInfo, 0, len(termNames))
	for _, tName := range termNames {
		term := cfg.Terminals[tName]
		label := term.Label
		if label == "" {
			label = tName
		}
		terminalConfigs = append(terminalConfigs, TerminalConfigInfo{
			Name:    tName,
			Label:   label,
			Cmd:     term.Cmd,
			Display: term.Display,
		})
	}

	return ProjectInfo{
		Name:          name,
		Session:       cfg.Name,
		Root:          cfg.Root,
		Running:       running,
		Services:      services,
		Actions:       actions,
		Terminals:     terminalConfigs,
		Profiles:      profiles,
		ActiveProfile: activeProfile,
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

	a.cacheMu.RLock()
	profiles := a.runningProfiles
	a.cacheMu.RUnlock()

	for _, name := range names {
		cfg, err := config.LoadProject(name)
		if err != nil {
			continue
		}
		running := sessions[cfg.Name]
		profile := ""
		if running {
			profile = profiles[name]
		}
		info := toProjectInfo(name, cfg, running, profile)
		info.StatusEntries = a.statusStore.List(name)
		projects = append(projects, info)
	}

	refreshDockMenu(projects)

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
	go a.ListProjects()
	return nil
}

func (a *App) StartProject(name, profile string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	a.invalidateSessionCache(name)
	if err := tmux.StartProject(cfg, profile); err != nil {
		return err
	}
	a.cacheMu.Lock()
	a.runningProfiles[name] = profile
	a.cacheMu.Unlock()
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}

func (a *App) StopProject(name string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	a.invalidateSessionCache(name)
	a.cacheMu.Lock()
	delete(a.runningProfiles, name)
	a.cacheMu.Unlock()
	if err := tmux.KillSession(cfg.Name); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
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
	profile := ""
	if running {
		profile = a.getRunningProfile(name)
	}
	info := toProjectInfo(name, cfg, running, profile)
	info.StatusEntries = a.statusStore.List(name)
	if info.StatusEntries == nil {
		info.StatusEntries = []StatusEntry{}
	}
	return &info, nil
}

func (a *App) getRunningProfile(name string) string {
	a.cacheMu.RLock()
	defer a.cacheMu.RUnlock()
	return a.runningProfiles[name]
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

// resolvePaneID returns the tmux pane ID for the given service pane index, or
// an error if the index is out of range.
func (a *App) resolvePaneID(projectName string, paneIndex int) (string, error) {
	session := a.cachedSessionName(projectName)
	panes := a.cachedPaneIDs(session)
	if paneIndex < 0 || paneIndex >= len(panes) {
		return "", fmt.Errorf("pane index %d out of range", paneIndex)
	}
	return panes[paneIndex], nil
}

func (a *App) GetServiceLogs(projectName string, paneIndex int, lines int) (string, error) {
	paneID, err := a.resolvePaneID(projectName, paneIndex)
	if err != nil {
		return "", err
	}
	return tmux.CapturePaneByID(paneID, lines)
}

// StopService sends Ctrl-C to the given service's pane, killing its command
// but leaving the pane (and its log history) intact.
func (a *App) StopService(projectName string, paneIndex int) error {
	paneID, err := a.resolvePaneID(projectName, paneIndex)
	if err != nil {
		return err
	}
	return tmux.StopServicePane(paneID)
}

// StartService re-runs the service's command in its existing pane.
func (a *App) StartService(projectName string, paneIndex int) error {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return err
	}
	serviceNames := cfg.ServicesForProfile(a.getRunningProfile(projectName))
	if paneIndex < 0 || paneIndex >= len(serviceNames) {
		return fmt.Errorf("service index %d out of range", paneIndex)
	}
	svc, ok := cfg.Services[serviceNames[paneIndex]]
	if !ok {
		return fmt.Errorf("service %q not found", serviceNames[paneIndex])
	}
	paneID, err := a.resolvePaneID(projectName, paneIndex)
	if err != nil {
		return err
	}
	return tmux.StartServicePane(paneID, cfg.Root, svc)
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
	if err := config.SaveProject(cfg); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}

func (a *App) ReadGlobalConfig() (string, error) {
	data, err := os.ReadFile(config.GlobalPath())
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func (a *App) SaveGlobalConfig(content string) error {
	var parsed config.GlobalConfig
	if err := yaml.Unmarshal([]byte(content), &parsed); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	if err := config.EnsureDirs(); err != nil {
		return err
	}
	if err := os.WriteFile(config.GlobalPath(), []byte(content), 0644); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
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
	if err := os.Remove(config.ProjectPath(name)); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}
