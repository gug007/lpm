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

// runState records how a project's tmux session was started. If services is
// non-empty, it overrides profile-based resolution (i.e. the session was
// started for a specific service subset rather than a named profile).
type runState struct {
	profile  string
	services []string
}

type ProjectInfo struct {
	Name          string               `json:"name"`
	Session       string               `json:"session"`
	Root          string               `json:"root"`
	Running       bool                 `json:"running"`
	Services      []ServiceInfo        `json:"services"`
	AllServices   []ServiceInfo        `json:"allServices"`
	Actions       []ActionInfo         `json:"actions"`
	Terminals     []TerminalConfigInfo `json:"terminals"`
	Profiles      []ProfileInfo        `json:"profiles"`
	ActiveProfile string               `json:"activeProfile"`
	StatusEntries []StatusEntry        `json:"statusEntries"`
	ConfigError   string               `json:"configError,omitempty"`
	ParentName    string               `json:"parentName,omitempty"`
}

type ServiceInfo struct {
	Name string `json:"name"`
	Cmd  string `json:"cmd"`
	Cwd  string `json:"cwd"`
	Port int    `json:"port"`
}

type ProfileInfo struct {
	Name     string   `json:"name"`
	Services []string `json:"services"`
}

type ActionInputInfo struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Placeholder string `json:"placeholder"`
	Default     string `json:"default"`
}

type ActionInfo struct {
	Name    string            `json:"name"`
	Label   string            `json:"label"`
	Cmd     string            `json:"cmd"`
	Cwd     string            `json:"cwd"`
	Env     map[string]string `json:"env,omitempty"`
	Confirm bool              `json:"confirm"`
	Display string            `json:"display"`
	Type    string            `json:"type"`
	Inputs  []ActionInputInfo `json:"inputs,omitempty"`
}

type TerminalConfigInfo struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	Cmd     string `json:"cmd"`
	Display string `json:"display"`
}

func toProjectInfo(name string, cfg *config.ProjectConfig, running bool, state runState) ProjectInfo {
	buildServiceInfos := func(names []string) []ServiceInfo {
		out := make([]ServiceInfo, 0, len(names))
		for _, svcName := range names {
			svc := cfg.Services[svcName]
			out = append(out, ServiceInfo{
				Name: svcName,
				Cmd:  svc.Cmd,
				Cwd:  svc.Cwd,
				Port: svc.Port,
			})
		}
		return out
	}

	runningServiceNames := resolveRunningServices(cfg, state)
	services := buildServiceInfos(runningServiceNames)

	activeProfile := state.profile
	if running && activeProfile == "" {
		activeProfile = matchProfile(cfg, runningServiceNames)
	}

	allSvcNames := make([]string, 0, len(cfg.Services))
	for svcName := range cfg.Services {
		allSvcNames = append(allSvcNames, svcName)
	}
	sort.Strings(allSvcNames)
	allServices := buildServiceInfos(allSvcNames)

	profileNames := make([]string, 0, len(cfg.Profiles))
	for pName := range cfg.Profiles {
		profileNames = append(profileNames, pName)
	}
	sort.Strings(profileNames)
	profiles := make([]ProfileInfo, 0, len(profileNames))
	for _, pName := range profileNames {
		profiles = append(profiles, ProfileInfo{
			Name:     pName,
			Services: slices.Clone(cfg.ServicesForProfile(pName)),
		})
	}

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

		var inputs []ActionInputInfo
		if len(act.Inputs) > 0 {
			inputKeys := make([]string, 0, len(act.Inputs))
			for k := range act.Inputs {
				inputKeys = append(inputKeys, k)
			}
			sort.Strings(inputKeys)
			for _, k := range inputKeys {
				inp := act.Inputs[k]
				typ := inp.Type
				if typ == "" {
					typ = "text"
				}
				lbl := inp.Label
				if lbl == "" {
					lbl = k
				}
				inputs = append(inputs, ActionInputInfo{
					Key:         k,
					Label:       lbl,
					Type:        typ,
					Required:    inp.Required,
					Placeholder: inp.Placeholder,
					Default:     inp.Default,
				})
			}
		}

		actions = append(actions, ActionInfo{
			Name:    aName,
			Label:   label,
			Cmd:     act.Cmd,
			Cwd:     act.Cwd,
			Env:     act.Env,
			Confirm: act.Confirm,
			Display: act.Display,
			Type:    act.Type,
			Inputs:  inputs,
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
		AllServices:   allServices,
		Actions:       actions,
		Terminals:     terminalConfigs,
		Profiles:      profiles,
		ActiveProfile: activeProfile,
		ParentName:    cfg.ParentName,
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

	stateSnapshot := a.snapshotRunningState()
	cache := make(map[string]*config.ProjectConfig, len(names))

	for _, name := range names {
		cfg, err := config.LoadProjectCached(name, cache)
		if err != nil {
			projects = append(projects, ProjectInfo{
				Name:        name,
				ConfigError: err.Error(),
				ParentName:  config.PeekParent(name),
			})
			continue
		}
		running := sessions[cfg.Name]
		var state runState
		if running {
			state = stateSnapshot[name]
		}
		info := toProjectInfo(name, cfg, running, state)
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

	a.settingsMu.Lock()
	settings := a.loadSettingsLocked()
	settings.ProjectOrder = order
	err := a.saveSettingsLocked(settings)
	a.settingsMu.Unlock()
	if err != nil {
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
	a.setRunningState(name, runState{profile: profile})
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}

// StartProjectWithServices starts the tmux session with an explicit service
// list, bypassing profile resolution.
func (a *App) StartProjectWithServices(name string, services []string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	if len(services) == 0 {
		return fmt.Errorf("no services selected")
	}
	for _, svc := range services {
		if _, ok := cfg.Services[svc]; !ok {
			return fmt.Errorf("service %q not found", svc)
		}
	}
	a.invalidateSessionCache(name)
	if err := tmux.StartProjectServices(cfg, services); err != nil {
		return err
	}
	a.setRunningState(name, runState{services: slices.Clone(services)})
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}

// ToggleProjectService adds or removes a single service from the running
// session without disturbing the others. Starts a fresh session when the
// project isn't running, and stops the project when the last service is
// removed.
func (a *App) ToggleProjectService(name, serviceName string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	svc, ok := cfg.Services[serviceName]
	if !ok {
		return fmt.Errorf("service %q not found", serviceName)
	}

	if !tmux.SessionExists(cfg.Name) {
		return a.StartProjectWithServices(name, []string{serviceName})
	}

	running := resolveRunningServices(cfg, a.getRunningState(name))
	idx := slices.Index(running, serviceName)

	var next []string
	switch {
	case idx < 0:
		if _, err := tmux.SplitSessionPane(cfg, svc); err != nil {
			return err
		}
		next = append(slices.Clone(running), serviceName)
	case len(running) == 1:
		return a.StopProject(name)
	default:
		paneID, err := a.resolvePaneID(name, idx)
		if err != nil {
			return err
		}
		if err := tmux.KillPane(paneID); err != nil {
			return err
		}
		next = slices.Delete(slices.Clone(running), idx, idx+1)
	}

	a.setRunningState(name, runState{services: next})
	a.invalidateSessionCache(name)
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}

// resolveRunningServices returns the ordered list of services actually running
// in the session, falling back to the profile's resolved list when the
// session was started via StartProject rather than StartProjectWithServices.
func resolveRunningServices(cfg *config.ProjectConfig, state runState) []string {
	if len(state.services) > 0 {
		return state.services
	}
	return cfg.ServicesForProfile(state.profile)
}

// matchProfile returns the profile whose services (as a set) exactly equal the
// given service names, or an empty string when none matches. Used to recover
// the active profile after the user has toggled individual services whose
// resulting set happens to equal a known profile.
func matchProfile(cfg *config.ProjectConfig, running []string) string {
	if len(running) == 0 {
		return ""
	}
	runSet := make(map[string]struct{}, len(running))
	for _, s := range running {
		runSet[s] = struct{}{}
	}
	names := make([]string, 0, len(cfg.Profiles))
	for n := range cfg.Profiles {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, name := range names {
		svcs := cfg.Profiles[name]
		if len(svcs) != len(running) {
			continue
		}
		matched := true
		for _, s := range svcs {
			if _, ok := runSet[s]; !ok {
				matched = false
				break
			}
		}
		if matched {
			return name
		}
	}
	return ""
}

func (a *App) StopProject(name string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	a.invalidateSessionCache(name)
	a.clearRunningState(name)
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
	var state runState
	if running {
		state = a.getRunningState(name)
	}
	info := toProjectInfo(name, cfg, running, state)
	info.StatusEntries = a.statusStore.List(name)
	return &info, nil
}

func (a *App) getRunningState(name string) runState {
	a.cacheMu.RLock()
	defer a.cacheMu.RUnlock()
	return a.runningState[name]
}

func (a *App) setRunningState(name string, state runState) {
	a.cacheMu.Lock()
	a.runningState[name] = state
	a.cacheMu.Unlock()
}

func (a *App) clearRunningState(name string) {
	a.cacheMu.Lock()
	delete(a.runningState, name)
	a.cacheMu.Unlock()
}

func (a *App) snapshotRunningState() map[string]runState {
	a.cacheMu.RLock()
	defer a.cacheMu.RUnlock()
	out := make(map[string]runState, len(a.runningState))
	for k, v := range a.runningState {
		out[k] = v
	}
	return out
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
	serviceNames := resolveRunningServices(cfg, a.getRunningState(projectName))
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
	// Duplicates share the original's config; show the parent file so edits
	// operate on the canonical settings rather than the pointer stub.
	target := name
	if parent := config.PeekParent(name); parent != "" {
		target = parent
	}
	data, err := os.ReadFile(config.ProjectPath(target))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SaveConfig returns the project name the frontend should stay on. Edits on
// a duplicate are routed to the parent file; edits on an original can rename
// via the `name:` field (unless the original has duplicates, in which case
// the cascade rename isn't supported yet).
func (a *App) SaveConfig(name string, content string) (string, error) {
	var parsed config.ProjectConfig
	if err := yaml.Unmarshal([]byte(content), &parsed); err != nil {
		return "", fmt.Errorf("invalid YAML: %w", err)
	}
	if err := parsed.Validate(); err != nil {
		return "", err
	}

	if parent := config.PeekParent(name); parent != "" {
		if err := writeConfigFile(config.ProjectPath(parent), content); err != nil {
			return "", err
		}
		a.invalidateSessionCache(parent)
		a.invalidateSessionCache(name)
		return name, nil
	}

	oldPath := config.ProjectPath(name)
	newName := parsed.Name
	if newName == "" {
		newName = name
	}

	if newName == name {
		if err := writeConfigFile(oldPath, content); err != nil {
			return "", err
		}
		a.invalidateSessionCache(name)
		return name, nil
	}

	dups, err := config.DuplicatesOf(name)
	if err != nil {
		return "", err
	}
	if len(dups) > 0 {
		return "", fmt.Errorf("cannot rename %q while duplicates exist", name)
	}
	if err := config.ValidateName(newName); err != nil {
		return "", err
	}
	newPath := config.ProjectPath(newName)
	if _, err := os.Stat(newPath); err == nil {
		return "", fmt.Errorf("project %q already exists", newName)
	}
	if err := writeConfigFile(newPath, content); err != nil {
		return "", err
	}
	os.Remove(oldPath)
	a.invalidateSessionCache(name)
	return newName, nil
}

func writeConfigFile(path, content string) error {
	mode := os.FileMode(0644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode()
	}
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
	// Removing an original that has duplicates would break config resolution
	// for all of them; force the user to remove duplicates first.
	if dups, err := config.DuplicatesOf(name); err == nil && len(dups) > 0 {
		return fmt.Errorf("cannot remove %q while duplicates exist: %v", name, dups)
	}
	cfg, loadErr := config.LoadProject(name)
	if loadErr == nil {
		tmux.KillSession(cfg.Name)
	}
	a.invalidateSessionCache(name)
	// Duplicates own the copied folder (LPM created it), so remove the tree
	// before dropping the pointer. If folder removal fails, bail out so the
	// user can retry the whole operation instead of orphaning a directory.
	if loadErr == nil && cfg.IsDuplicate() && cfg.Root != "" {
		if err := os.RemoveAll(cfg.Root); err != nil {
			return fmt.Errorf("failed to remove duplicate folder %q: %w", cfg.Root, err)
		}
	}
	if err := os.Remove(config.ProjectPath(name)); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}
