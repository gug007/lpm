package main

import (
	"errors"
	"fmt"
	"os"
	"slices"
	"sort"
	"strings"
	"syscall"
	"time"

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
	Name          string        `json:"name"`
	Session       string        `json:"session"`
	Root          string        `json:"root"`
	Label         string        `json:"label,omitempty"`
	Running       bool          `json:"running"`
	Services      []ServiceInfo `json:"services"`
	AllServices   []ServiceInfo `json:"allServices"`
	Actions       []ActionInfo  `json:"actions"`
	Profiles      []ProfileInfo `json:"profiles"`
	ActiveProfile string        `json:"activeProfile"`
	StatusEntries []StatusEntry `json:"statusEntries"`
	ConfigError   string        `json:"configError,omitempty"`
	ParentName    string        `json:"parentName,omitempty"`
	IsRemote      bool          `json:"isRemote"`
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

type ActionInputOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type ActionInputInfo struct {
	Key         string              `json:"key"`
	Label       string              `json:"label"`
	Type        string              `json:"type"`
	Required    bool                `json:"required"`
	Placeholder string              `json:"placeholder"`
	Default     string              `json:"default"`
	Options     []ActionInputOption `json:"options,omitempty"`
}

func buildInputInfos(inputs map[string]config.ActionInput) []ActionInputInfo {
	if len(inputs) == 0 {
		return nil
	}
	keys := make([]string, 0, len(inputs))
	for k := range inputs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]ActionInputInfo, 0, len(keys))
	for _, k := range keys {
		inp := inputs[k]
		typ := inp.Type
		if typ == "" {
			typ = "text"
		}
		lbl := inp.Label
		if lbl == "" {
			lbl = k
		}
		opts := make([]ActionInputOption, len(inp.Options))
		for i, o := range inp.Options {
			opts[i] = ActionInputOption{Label: o.Label, Value: o.Value}
		}
		out = append(out, ActionInputInfo{
			Key:         k,
			Label:       lbl,
			Type:        typ,
			Required:    inp.Required,
			Placeholder: inp.Placeholder,
			Default:     inp.Default,
			Options:     opts,
		})
	}
	return out
}

type ActionInfo struct {
	Name     string            `json:"name"`
	Label    string            `json:"label"`
	Cmd      string            `json:"cmd"`
	Cwd      string            `json:"cwd"`
	Env      map[string]string `json:"env,omitempty"`
	Confirm  bool              `json:"confirm"`
	Display  string            `json:"display"`
	Type     string            `json:"type"`
	Reuse    bool              `json:"reuse"`
	Position *float64          `json:"position,omitempty"`
	Inputs   []ActionInputInfo `json:"inputs,omitempty"`
	Children []ActionInfo      `json:"children,omitempty"`
}

// sortActionNames orders names by Position ascending; entries without a
// Position are appended afterwards in alphabetical order. The ordering is
// stable so identical positions fall back to alphabetical.
func sortActionNames(names []string, posOf func(string) *float64) {
	sort.SliceStable(names, func(i, j int) bool {
		pi, pj := posOf(names[i]), posOf(names[j])
		switch {
		case pi != nil && pj != nil:
			if *pi != *pj {
				return *pi < *pj
			}
			return names[i] < names[j]
		case pi != nil:
			return true
		case pj != nil:
			return false
		default:
			return names[i] < names[j]
		}
	})
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

	resolved := cfg.ResolvedActions()
	actionNames := make([]string, 0, len(resolved))
	for aName := range resolved {
		actionNames = append(actionNames, aName)
	}
	sortActionNames(actionNames, func(name string) *float64 {
		return resolved[name].Position
	})

	actions := make([]ActionInfo, 0, len(actionNames))
	for _, aName := range actionNames {
		act := resolved[aName]
		label := act.Label
		if label == "" {
			label = aName
		}

		inputs := buildInputInfos(act.Inputs)

		var children []ActionInfo
		if len(act.Actions) > 0 {
			childNames := make([]string, 0, len(act.Actions))
			for cn := range act.Actions {
				childNames = append(childNames, cn)
			}
			sortActionNames(childNames, func(name string) *float64 {
				return act.Actions[name].Position
			})
			for _, cn := range childNames {
				child, _ := act.ResolvedChild(cn)
				childLabel := child.Label
				if childLabel == "" {
					childLabel = cn
				}
				children = append(children, ActionInfo{
					Name:     aName + ":" + cn,
					Label:    childLabel,
					Cmd:      child.Cmd,
					Cwd:      child.Cwd,
					Env:      child.Env,
					Confirm:  child.Confirm,
					Display:  child.Display,
					Type:     child.Type,
					Reuse:    child.Reuse,
					Position: child.Position,
					Inputs:   buildInputInfos(child.Inputs),
				})
			}
		}

		actions = append(actions, ActionInfo{
			Name:     aName,
			Label:    label,
			Cmd:      act.Cmd,
			Cwd:      act.Cwd,
			Env:      act.Env,
			Confirm:  act.Confirm,
			Display:  act.Display,
			Type:     act.Type,
			Reuse:    act.Reuse,
			Position: act.Position,
			Inputs:   inputs,
			Children: children,
		})
	}

	return ProjectInfo{
		Name:          name,
		Session:       cfg.Name,
		Root:          cfg.Root,
		Label:         cfg.Label,
		Running:       running,
		Services:      services,
		AllServices:   allServices,
		Actions:       actions,
		Profiles:      profiles,
		ActiveProfile: activeProfile,
		ParentName:    cfg.ParentName,
		IsRemote:      cfg.IsRemote(),
	}
}

func (a *App) ListProjects() ([]ProjectInfo, error) {
	names, err := config.ListProjects()
	if err != nil {
		return nil, err
	}

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

	projects = a.applyProjectOrder(projects)

	refreshDockMenu(projects)

	return projects, nil
}

func (a *App) applyProjectOrder(projects []ProjectInfo) []ProjectInfo {
	a.cacheMu.RLock()
	order := a.projectOrder
	a.cacheMu.RUnlock()

	byName := make(map[string]ProjectInfo, len(projects))
	for _, p := range projects {
		byName[p.Name] = p
	}

	ordered := make([]ProjectInfo, 0, len(projects))
	for _, n := range order {
		if p, ok := byName[n]; ok {
			ordered = append(ordered, p)
			delete(byName, n)
		}
	}
	for _, p := range projects {
		if _, ok := byName[p.Name]; ok {
			ordered = append(ordered, p)
			delete(byName, p.Name)
		}
	}

	return groupDuplicatesAfterParents(ordered)
}

// groupDuplicatesAfterParents enforces the "duplicate lives next to its
// source" rule so existing state self-heals and a dragged duplicate snaps
// back to its parent on the next read. Orphan duplicates keep their slot.
func groupDuplicatesAfterParents(ordered []ProjectInfo) []ProjectInfo {
	nameSet := make(map[string]bool, len(ordered))
	for _, p := range ordered {
		nameSet[p.Name] = true
	}
	children := make(map[string][]ProjectInfo)
	stripped := make([]ProjectInfo, 0, len(ordered))
	for _, p := range ordered {
		if p.ParentName != "" && nameSet[p.ParentName] {
			children[p.ParentName] = append(children[p.ParentName], p)
			continue
		}
		stripped = append(stripped, p)
	}
	if len(children) == 0 {
		return ordered
	}
	result := make([]ProjectInfo, 0, len(ordered))
	for _, p := range stripped {
		result = append(result, p)
		if kids, ok := children[p.Name]; ok {
			result = append(result, kids...)
		}
	}
	return result
}

// SetProjectLabel writes a display-only label to the project's config.
// The label is optional — an empty string (after trimming) clears it,
// causing the UI to fall back to the project's identifier name.
func (a *App) SetProjectLabel(name, label string) error {
	cfg, err := config.LoadProject(name)
	if err != nil {
		return err
	}
	trimmed := strings.TrimSpace(label)
	if cfg.Label == trimmed {
		return nil
	}
	cfg.Label = trimmed
	if err := config.SaveProject(cfg); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
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
	a.startPortPoller(name)
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
	a.startPortPoller(name)
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
	a.stopPortPoller(name)
	a.stopProjectPortForwards(name)
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
		a.stopPortPoller(name)
		a.stopProjectPortForwards(name)
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
	if len(ids) == 0 {
		return ids
	}
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
	return tmux.StartServicePane(paneID, cfg, svc)
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
	if config.ProjectExists(newName) {
		return "", fmt.Errorf("project %q already exists", newName)
	}
	newPath := config.ProjectPath(newName)
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
	if config.ProjectExists(name) {
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

// SSHConfig is the connection profile collected from the New SSH Project
// dialog. Mirrors config.SSHSettings field-for-field so the frontend can
// build it directly; we copy into SSHSettings on save.
type SSHConfig struct {
	Host string `json:"host"`
	User string `json:"user"`
	Port int    `json:"port"`
	Key  string `json:"key"`
	Dir  string `json:"dir"`
}

func (a *App) CreateSSHProject(name string, ssh SSHConfig) error {
	if err := config.ValidateName(name); err != nil {
		return err
	}
	host := strings.TrimSpace(ssh.Host)
	user := strings.TrimSpace(ssh.User)
	if host == "" {
		return fmt.Errorf("host is required")
	}
	if user == "" {
		return fmt.Errorf("user is required")
	}
	if ssh.Port < 0 || ssh.Port > 65535 {
		return fmt.Errorf("invalid port %d", ssh.Port)
	}
	if config.ProjectExists(name) {
		return fmt.Errorf("project %q already exists", name)
	}

	cfg := &config.ProjectConfig{
		Name: name,
		SSH: &config.SSHSettings{
			Host: host,
			User: user,
			Port: ssh.Port,
			Key:  strings.TrimSpace(ssh.Key),
			Dir:  strings.TrimSpace(ssh.Dir),
		},
		Services: map[string]config.Service{
			"shell": {Cmd: `exec "$SHELL" -l`},
		},
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
	a.StopLogStreaming(name)
	a.invalidateSessionCache(name)
	a.clearRunningState(name)
	a.removeProjectSync(name)
	// Quiesce the tree before deletion: live shells writing into it
	// (bundle, rails, spring) race RemoveAll's walk and surface as
	// ENOTEMPTY on the final rmdir.
	a.stopProjectTerminals(name)
	a.stopPortPoller(name)
	a.stopProjectPortForwards(name)
	if loadErr == nil {
		a.stopWatcherIfRoot(cfg.Root)
	}
	// Duplicates own the copied folder (LPM created it), so remove the tree
	// before dropping the pointer. If folder removal fails, bail out so the
	// user can retry the whole operation instead of orphaning a directory.
	if loadErr == nil && cfg.IsDuplicate() && cfg.Root != "" {
		if err := removeAllWithRetry(cfg.Root); err != nil {
			return fmt.Errorf("failed to remove duplicate folder %q: %w", cfg.Root, err)
		}
	}
	if err := os.Remove(config.ProjectPath(name)); err != nil {
		return err
	}
	a.statusStore.ClearProject(name)
	a.removeTerminalsEntry(name)
	a.removeSettingsReferences(name)
	a.removeNotes(name)
	runtime.EventsEmit(a.ctx, "projects-changed")
	return nil
}

func (a *App) removeTerminalsEntry(name string) {
	cfg := a.LoadTerminals()
	if _, ok := cfg.Projects[name]; !ok {
		return
	}
	delete(cfg.Projects, name)
	if err := a.SaveTerminals(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to save terminals after removing %s: %v\n", name, err)
	}
}

func (a *App) removeSettingsReferences(name string) {
	a.settingsMu.Lock()
	settings := a.loadSettingsLocked()
	changed := false
	if idx := slices.Index(settings.ProjectOrder, name); idx >= 0 {
		settings.ProjectOrder = slices.Delete(settings.ProjectOrder, idx, idx+1)
		changed = true
	}
	if settings.LastSelectedProject == name {
		settings.LastSelectedProject = ""
		changed = true
	}
	if changed {
		if err := a.saveSettingsLocked(settings); err != nil {
			fmt.Fprintf(os.Stderr, "warning: failed to save settings after removing %s: %v\n", name, err)
		}
	}
	a.settingsMu.Unlock()
	if changed {
		a.cacheMu.Lock()
		a.projectOrder = settings.ProjectOrder
		a.cacheMu.Unlock()
	}
}

// removeAllWithRetry wraps os.RemoveAll with linear backoff on ENOTEMPTY.
// Even after killing PTYs and detaching the watcher, Spotlight/mdworker
// can drop metadata into the tree mid-walk and race the final rmdir;
// these retries cover that without slowing the common case.
func removeAllWithRetry(path string) error {
	const (
		maxAttempts = 5
		baseDelay   = 100 * time.Millisecond
	)
	var err error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		err = os.RemoveAll(path)
		if err == nil || !errors.Is(err, syscall.ENOTEMPTY) {
			return err
		}
		time.Sleep(time.Duration(attempt+1) * baseDelay)
	}
	return err
}
