package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// ResolveCwd resolves cwd relative to root. Returns root when cwd is empty.
func ResolveCwd(root, cwd string) string {
	if cwd == "" {
		return root
	}
	if filepath.IsAbs(cwd) {
		return cwd
	}
	return filepath.Join(root, cwd)
}

type Service struct {
	Cmd      string            `yaml:"cmd"`
	Cwd      string            `yaml:"cwd,omitempty"`
	Port     int               `yaml:"port,omitempty"`
	Env      map[string]string `yaml:"env,omitempty"`
	Profiles []string          `yaml:"profiles,omitempty"`
}

func (s *Service) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		s.Cmd = value.Value
		return nil
	}
	type plain Service
	return value.Decode((*plain)(s))
}

type ActionInputOption struct {
	Label string `yaml:"label" json:"label"`
	Value string `yaml:"value" json:"value"`
}

func (o *ActionInputOption) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		o.Label = value.Value
		o.Value = value.Value
		return nil
	}
	type plain ActionInputOption
	return value.Decode((*plain)(o))
}

type ActionInput struct {
	Label       string              `yaml:"label,omitempty"`
	Type        string              `yaml:"type,omitempty"`
	Required    bool                `yaml:"required,omitempty"`
	Placeholder string              `yaml:"placeholder,omitempty"`
	Default     string              `yaml:"default,omitempty"`
	Options     []ActionInputOption `yaml:"options,omitempty"`
}

type Action struct {
	Cmd     string                 `yaml:"cmd"`
	Label   string                 `yaml:"label,omitempty"`
	Cwd     string                 `yaml:"cwd,omitempty"`
	Env     map[string]string      `yaml:"env,omitempty"`
	Confirm bool                   `yaml:"confirm,omitempty"`
	Display string                 `yaml:"display,omitempty"`
	Type    string                 `yaml:"type,omitempty"`
	Inputs  map[string]ActionInput `yaml:"inputs,omitempty"`
	Actions ActionMap              `yaml:"actions,omitempty"`
}

func (a *Action) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		a.Cmd = value.Value
		return nil
	}
	type plain Action
	return value.Decode((*plain)(a))
}

// ResolvedChild returns a copy of the named child action with cwd and env
// inherited from the parent. Returns false when the child does not exist.
func (a Action) ResolvedChild(name string) (Action, bool) {
	child, ok := a.Actions[name]
	if !ok {
		return Action{}, false
	}
	if child.Cwd == "" {
		child.Cwd = a.Cwd
	}
	if len(a.Env) > 0 {
		merged := make(map[string]string, len(a.Env)+len(child.Env))
		for k, v := range a.Env {
			merged[k] = v
		}
		for k, v := range child.Env {
			merged[k] = v
		}
		child.Env = merged
	}
	return child, true
}

type Terminal struct {
	Cmd     string            `yaml:"cmd"`
	Label   string            `yaml:"label,omitempty"`
	Cwd     string            `yaml:"cwd,omitempty"`
	Env     map[string]string `yaml:"env,omitempty"`
	Display string            `yaml:"display,omitempty"`
}

func (t *Terminal) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		t.Cmd = value.Value
		return nil
	}
	type plain Terminal
	return value.Decode((*plain)(t))
}

// decodeNamedMap decodes a YAML node into a name-keyed map, accepting either
// the canonical mapping form (`name: {...}`) or a sequence of entries each
// carrying a `name:` field. yaml.v3 silently ignores the `name` key during
// struct decode, so sequence items decode straight into T with no rewriting.
func decodeNamedMap[T any](value *yaml.Node, section string) (map[string]T, error) {
	out := map[string]T{}
	switch value.Kind {
	case yaml.MappingNode:
		if err := value.Decode(&out); err != nil {
			return nil, err
		}
		return out, nil
	case yaml.SequenceNode:
		for i, item := range value.Content {
			if item.Kind != yaml.MappingNode {
				return nil, fmt.Errorf("%s[%d]: expected mapping", section, i)
			}
			var name string
			for j := 0; j+1 < len(item.Content); j += 2 {
				if item.Content[j].Value == "name" {
					name = item.Content[j+1].Value
					break
				}
			}
			if name == "" {
				return nil, fmt.Errorf("%s[%d]: missing name", section, i)
			}
			if _, dup := out[name]; dup {
				return nil, fmt.Errorf("%s[%d]: duplicate name %q", section, i, name)
			}
			var v T
			if err := item.Decode(&v); err != nil {
				return nil, fmt.Errorf("%s[%d]: %w", section, i, err)
			}
			out[name] = v
		}
		return out, nil
	default:
		return nil, fmt.Errorf("%s: expected mapping or sequence at line %d", section, value.Line)
	}
}

type ServiceMap map[string]Service

func (m *ServiceMap) UnmarshalYAML(value *yaml.Node) error {
	out, err := decodeNamedMap[Service](value, "services")
	if err != nil {
		return err
	}
	*m = out
	return nil
}

type ActionMap map[string]Action

func (m *ActionMap) UnmarshalYAML(value *yaml.Node) error {
	out, err := decodeNamedMap[Action](value, "actions")
	if err != nil {
		return err
	}
	*m = out
	return nil
}

type TerminalMap map[string]Terminal

func (m *TerminalMap) UnmarshalYAML(value *yaml.Node) error {
	out, err := decodeNamedMap[Terminal](value, "terminals")
	if err != nil {
		return err
	}
	*m = out
	return nil
}

type ProjectConfig struct {
	Name       string              `yaml:"name"`
	Root       string              `yaml:"root"`
	Label      string              `yaml:"label,omitempty"`
	ParentName string              `yaml:"parent_name,omitempty"`
	Services   ServiceMap          `yaml:"services,omitempty"`
	Actions    ActionMap           `yaml:"actions,omitempty"`
	Terminals  TerminalMap         `yaml:"terminals,omitempty"`
	Profiles   map[string][]string `yaml:"profiles,omitempty"`
}

func (p *ProjectConfig) IsDuplicate() bool {
	return p.ParentName != ""
}

type GlobalConfig struct {
	Actions   ActionMap   `yaml:"actions,omitempty"`
	Terminals TerminalMap `yaml:"terminals,omitempty"`
}

func LpmDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".lpm")
}

func GlobalPath() string {
	return filepath.Join(LpmDir(), "global.yml")
}

func ProjectsDir() string {
	return filepath.Join(LpmDir(), "projects")
}

func LoadGlobal() *GlobalConfig {
	data, err := os.ReadFile(GlobalPath())
	if err != nil {
		return &GlobalConfig{}
	}
	var cfg GlobalConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return &GlobalConfig{}
	}
	expandActionCwds(cfg.Actions)
	for name, term := range cfg.Terminals {
		if term.Cwd != "" {
			term.Cwd = expandHome(term.Cwd)
			cfg.Terminals[name] = term
		}
	}
	return &cfg
}

func EnsureDirs() error {
	return os.MkdirAll(ProjectsDir(), 0755)
}

func ValidateName(name string) error {
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") || name == "." || name == ".." {
		return fmt.Errorf("invalid project name: %q", name)
	}
	return nil
}

func ProjectPath(name string) string {
	return filepath.Join(ProjectsDir(), name+".yml")
}

func SessionName(name string) string {
	path := ProjectPath(name)
	data, err := os.ReadFile(path)
	if err != nil {
		return name
	}
	var partial struct {
		Name string `yaml:"name"`
	}
	if err := yaml.Unmarshal(data, &partial); err != nil || partial.Name == "" {
		return name
	}
	return partial.Name
}

func LoadProject(name string) (*ProjectConfig, error) {
	return LoadProjectCached(name, nil)
}

// LoadProjectCached behaves like LoadProject but shares resolved parent
// configs through the supplied cache so a batch load resolves each parent
// once. Pass nil to disable sharing.
func LoadProjectCached(name string, cache map[string]*ProjectConfig) (*ProjectConfig, error) {
	if cache != nil {
		if hit, ok := cache[name]; ok {
			return hit, nil
		}
	}
	if err := ValidateName(name); err != nil {
		return nil, err
	}
	path := ProjectPath(name)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("project %q not found. Run 'lpm init %s' to create it, or 'lpm list' to see available projects", name, name)
		}
		return nil, fmt.Errorf("failed to read project %q: %w", name, err)
	}

	var cfg ProjectConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid config for %q: %w", name, err)
	}

	if cfg.Name == "" {
		cfg.Name = name
	}
	cfg.Root = expandHome(cfg.Root)

	// Parent already applied expandHome and global merge during its own load;
	// reuse its resolved maps and skip both passes below for duplicates.
	if cfg.ParentName != "" {
		parent, err := LoadProjectCached(cfg.ParentName, cache)
		if err != nil {
			return nil, fmt.Errorf("duplicate %q: cannot load parent %q: %w", name, cfg.ParentName, err)
		}
		cfg.Services = parent.Services
		cfg.Actions = parent.Actions
		cfg.Terminals = parent.Terminals
		cfg.Profiles = parent.Profiles
		if err := cfg.Validate(); err != nil {
			return nil, err
		}
		if cache != nil {
			cache[name] = &cfg
		}
		return &cfg, nil
	}

	for name, svc := range cfg.Services {
		if svc.Cwd != "" {
			svc.Cwd = expandHome(svc.Cwd)
			cfg.Services[name] = svc
		}
	}
	expandActionCwds(cfg.Actions)
	for name, term := range cfg.Terminals {
		if term.Cwd != "" {
			term.Cwd = expandHome(term.Cwd)
			cfg.Terminals[name] = term
		}
	}

	// Merge global actions/terminals (project entries take precedence)
	global := LoadGlobal()
	if len(global.Actions) > 0 {
		if cfg.Actions == nil {
			cfg.Actions = make(ActionMap)
		}
		for k, v := range global.Actions {
			if _, exists := cfg.Actions[k]; !exists {
				cfg.Actions[k] = v
			}
		}
	}
	if len(global.Terminals) > 0 {
		if cfg.Terminals == nil {
			cfg.Terminals = make(TerminalMap)
		}
		for k, v := range global.Terminals {
			if _, exists := cfg.Terminals[k]; !exists {
				cfg.Terminals[k] = v
			}
		}
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cache != nil {
		cache[name] = &cfg
	}
	return &cfg, nil
}

func (p *ProjectConfig) Validate() error {
	var errs []string

	ports := map[int]string{}
	for name, svc := range p.Services {
		if strings.TrimSpace(svc.Cmd) == "" {
			errs = append(errs, fmt.Sprintf("service %q: missing cmd", name))
		}
		if svc.Port < 0 || svc.Port > 65535 {
			errs = append(errs, fmt.Sprintf("service %q: invalid port %d", name, svc.Port))
		}
		if svc.Port > 0 {
			if other, dup := ports[svc.Port]; dup {
				errs = append(errs, fmt.Sprintf("service %q: port %d already used by %q", name, svc.Port, other))
			}
			ports[svc.Port] = name
		}
		if svc.Cwd != "" {
			abs := svc.Cwd
			if !filepath.IsAbs(abs) {
				abs = filepath.Join(p.Root, abs)
			}
			if info, err := os.Stat(abs); err != nil || !info.IsDir() {
				errs = append(errs, fmt.Sprintf("service %q: cwd %q does not exist", name, svc.Cwd))
			}
		}
	}

	for name, act := range p.Actions {
		if strings.TrimSpace(act.Cmd) == "" && len(act.Actions) == 0 {
			errs = append(errs, fmt.Sprintf("action %q: missing cmd", name))
		}
		if act.Cwd != "" {
			abs := act.Cwd
			if !filepath.IsAbs(abs) {
				abs = filepath.Join(p.Root, abs)
			}
			if info, err := os.Stat(abs); err != nil || !info.IsDir() {
				errs = append(errs, fmt.Sprintf("action %q: cwd %q does not exist", name, act.Cwd))
			}
		}
		for childName, child := range act.Actions {
			if strings.TrimSpace(child.Cmd) == "" {
				errs = append(errs, fmt.Sprintf("action %q.%q: missing cmd", name, childName))
			}
			if child.Cwd != "" {
				abs := child.Cwd
				if !filepath.IsAbs(abs) {
					abs = filepath.Join(p.Root, abs)
				}
				if info, err := os.Stat(abs); err != nil || !info.IsDir() {
					errs = append(errs, fmt.Sprintf("action %q.%q: cwd %q does not exist", name, childName, child.Cwd))
				}
			}
		}
	}

	for name, term := range p.Terminals {
		if strings.TrimSpace(term.Cmd) == "" {
			errs = append(errs, fmt.Sprintf("terminal %q: missing cmd", name))
		}
		if term.Cwd != "" {
			abs := term.Cwd
			if !filepath.IsAbs(abs) {
				abs = filepath.Join(p.Root, abs)
			}
			if info, err := os.Stat(abs); err != nil || !info.IsDir() {
				errs = append(errs, fmt.Sprintf("terminal %q: cwd %q does not exist", name, term.Cwd))
			}
		}
	}

	for pName, services := range p.Profiles {
		for _, svcName := range services {
			if _, ok := p.Services[svcName]; !ok {
				errs = append(errs, fmt.Sprintf("profile %q: references unknown service %q", pName, svcName))
			}
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("config validation failed:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return nil
}

func ListProjects() ([]string, error) {
	entries, err := os.ReadDir(ProjectsDir())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var names []string
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".yml" {
			names = append(names, e.Name()[:len(e.Name())-4])
		}
	}
	return names, nil
}

// PeekParent returns the parent_name field from the given project's YAML
// without fully loading or validating. Empty when the project has no parent
// or the file cannot be read.
func PeekParent(name string) string {
	data, err := os.ReadFile(ProjectPath(name))
	if err != nil {
		return ""
	}
	var partial struct {
		ParentName string `yaml:"parent_name"`
	}
	if err := yaml.Unmarshal(data, &partial); err != nil {
		return ""
	}
	return partial.ParentName
}

// DuplicatesOf returns the names of all projects whose parent_name points at
// the given project.
func DuplicatesOf(name string) ([]string, error) {
	names, err := ListProjects()
	if err != nil {
		return nil, err
	}
	var out []string
	for _, n := range names {
		if PeekParent(n) == name {
			out = append(out, n)
		}
	}
	return out, nil
}

func SaveProject(cfg *ProjectConfig) error {
	if err := EnsureDirs(); err != nil {
		return err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}

	// Add blank lines before top-level sections for readability
	out := string(data)
	out = strings.Replace(out, "\nservices:\n", "\n\nservices:\n", 1)
	out = strings.Replace(out, "\nactions:\n", "\n\nactions:\n", 1)
	out = strings.Replace(out, "\nterminals:\n", "\n\nterminals:\n", 1)
	out = strings.Replace(out, "\nprofiles:\n", "\n\nprofiles:\n", 1)

	path := filepath.Join(ProjectsDir(), cfg.Name+".yml")
	return os.WriteFile(path, []byte(out), 0644)
}

func expandActionCwds(actions ActionMap) {
	for name, act := range actions {
		if act.Cwd != "" {
			act.Cwd = expandHome(act.Cwd)
		}
		for cn, child := range act.Actions {
			if child.Cwd != "" {
				child.Cwd = expandHome(child.Cwd)
				act.Actions[cn] = child
			}
		}
		actions[name] = act
	}
}

func expandHome(path string) string {
	if path == "~" {
		home, _ := os.UserHomeDir()
		return home
	}
	if len(path) > 1 && path[:2] == "~/" {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[2:])
	}
	return path
}

func (p *ProjectConfig) ServicesForProfile(profile string) []string {
	if profile == "" {
		profile = "default"
	}

	if names, ok := p.Profiles[profile]; ok {
		return names
	}

	// No profiles defined — return all services sorted for stable pane ordering
	var all []string
	for name := range p.Services {
		all = append(all, name)
	}
	sort.Strings(all)
	return all
}
