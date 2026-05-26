package config

import (
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strconv"
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
	Cmd      string                 `yaml:"cmd"`
	Label    string                 `yaml:"label,omitempty"`
	Cwd      string                 `yaml:"cwd,omitempty"`
	Port     int                    `yaml:"port,omitempty"`
	Env      map[string]string      `yaml:"env,omitempty"`
	Confirm  bool                   `yaml:"confirm,omitempty"`
	Display  string                 `yaml:"display,omitempty"`
	Type     string                 `yaml:"type,omitempty"`
	Reuse    bool                   `yaml:"reuse,omitempty"`
	Mode     string                 `yaml:"mode,omitempty"`
	Position *float64               `yaml:"position,omitempty"`
	Inputs   map[string]ActionInput `yaml:"inputs,omitempty"`
	Actions  ActionMap              `yaml:"actions,omitempty"`
}

// Action.Mode allowed values. Empty falls back to ActionModeRemote on SSH
// projects (and is irrelevant on local ones). ActionModeSync runs the
// action locally against an rsync mirror of ssh.dir.
const (
	ActionModeRemote = "remote"
	ActionModeSync   = "sync"
)

func (a *Action) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		a.Cmd = value.Value
		return nil
	}
	type plain Action
	return value.Decode((*plain)(a))
}

// ResolvedChild returns a copy of the named child action with cwd, env,
// and mode inherited from the parent. Returns false when the child does
// not exist.
func (a Action) ResolvedChild(name string) (Action, bool) {
	child, ok := a.Actions[name]
	if !ok {
		return Action{}, false
	}
	if child.Cwd == "" {
		child.Cwd = a.Cwd
	}
	if child.Mode == "" {
		child.Mode = a.Mode
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

// TerminalMap is a YAML sugar section: entries are decoded as Actions and
// default to Type="terminal" so they render alongside regular actions with
// full support for children, inputs, and nested sub-commands.
type TerminalMap map[string]Action

func (m *TerminalMap) UnmarshalYAML(value *yaml.Node) error {
	out, err := decodeNamedMap[Action](value, "terminals")
	if err != nil {
		return err
	}
	for name, a := range out {
		if a.Type == "" {
			a.Type = "terminal"
		}
		out[name] = a
	}
	*m = TerminalMap(out)
	return nil
}

type SSHSettings struct {
	Host string `yaml:"host"`
	User string `yaml:"user"`
	Port int    `yaml:"port,omitempty"`
	Key  string `yaml:"key,omitempty"`
	Dir  string `yaml:"dir,omitempty"`
}

type ProjectConfig struct {
	Name       string              `yaml:"name"`
	Root       string              `yaml:"root,omitempty"`
	Label      string              `yaml:"label,omitempty"`
	ParentName string              `yaml:"parent_name,omitempty"`
	SSH        *SSHSettings        `yaml:"ssh,omitempty"`
	Extends    []string            `yaml:"extends,omitempty"`
	Services   ServiceMap          `yaml:"services,omitempty"`
	Actions    ActionMap           `yaml:"actions,omitempty"`
	Terminals  TerminalMap         `yaml:"terminals,omitempty"`
	Profiles   map[string][]string `yaml:"profiles,omitempty"`
}

func (p *ProjectConfig) IsRemote() bool {
	return p.SSH != nil && p.SSH.Host != "" && p.SSH.User != ""
}

func SSHArgs(s *SSHSettings) []string {
	args := []string{
		"-t",
		"-o", "ControlMaster=auto",
		"-o", "ControlPath=" + SSHControlPath(),
		"-o", "ControlPersist=10m",
	}
	if s.Port > 0 && s.Port != 22 {
		args = append(args, "-p", strconv.Itoa(s.Port))
	}
	if key := strings.TrimSpace(s.Key); key != "" {
		args = append(args, "-i", ExpandHome(key))
	}
	args = append(args, fmt.Sprintf("%s@%s", s.User, s.Host))
	return args
}

// SCPArgs returns scp options that piggyback on the same ControlMaster
// socket SSHArgs uses, so an scp call from a long-lived terminal session
// reuses the open mux instead of opening a new auth/handshake.
// Differs from SSHArgs only by dropping -t and using -P for port.
func SCPArgs(s *SSHSettings) []string {
	args := []string{
		"-o", "ControlMaster=auto",
		"-o", "ControlPath=" + SSHControlPath(),
		"-o", "ControlPersist=10m",
	}
	if s.Port > 0 && s.Port != 22 {
		args = append(args, "-P", strconv.Itoa(s.Port))
	}
	if key := strings.TrimSpace(s.Key); key != "" {
		args = append(args, "-i", ExpandHome(key))
	}
	return args
}

// SSHControlDir is the parent directory for SSH ControlMaster sockets.
// /tmp keeps the path short enough that <dir>/cm-<%C-hash> stays under
// the 104-byte sun_path limit; the per-uid suffix avoids collisions on
// shared hosts. Callers must ensure it exists (see EnsureSSHControlDir).
func SSHControlDir() string {
	uid := "0"
	if u, err := user.Current(); err == nil && u.Uid != "" {
		uid = u.Uid
	}
	return filepath.Join("/tmp", "lpm-"+uid)
}

// SSHControlPath is the ControlPath template fed to ssh. %C is hashed by
// ssh into a fixed 64-char string, keeping every socket name the same
// length regardless of host/user.
func SSHControlPath() string {
	return filepath.Join(SSHControlDir(), "cm-%C")
}

// EnsureSSHControlDir creates the parent directory for SSH control
// sockets with 0700 perms. Best-effort — ssh surfaces a clear error if
// the directory is missing or unwritable.
func EnsureSSHControlDir() error {
	return os.MkdirAll(SSHControlDir(), 0o700)
}

// JoinRemoteDir composes a remote working directory from the project's
// ssh.dir and a per-command cwd. Tilde-prefixed paths are preserved
// verbatim so the remote shell can expand them.
func JoinRemoteDir(dir, cwd string) string {
	cwd = strings.TrimRight(strings.TrimSpace(cwd), "/")
	dir = strings.TrimRight(strings.TrimSpace(dir), "/")
	if cwd == "" {
		return dir
	}
	if strings.HasPrefix(cwd, "/") || strings.HasPrefix(cwd, "~") {
		return cwd
	}
	if dir == "" {
		return cwd
	}
	return dir + "/" + cwd
}

// QuoteRemotePath quotes a path for safe inclusion inside a remote
// shell script. Tilde-prefixed paths emit a `"$HOME"` segment that the
// remote shell expands; the rest stays single-quoted so $vars, quotes,
// and backticks pass through literally.
func QuoteRemotePath(p string) string {
	if p == "" {
		return ""
	}
	if p == "~" {
		return `"$HOME"`
	}
	if strings.HasPrefix(p, "~/") {
		return `"$HOME"` + ShellQuote("/"+p[2:])
	}
	return ShellQuote(p)
}

func ShellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

// WrapAsLoginShell wraps a remote script in `bash -ilc '...'` so the
// remote login + interactive rc files run, putting nvm/rbenv/asdf-managed
// tools on PATH. Plain `ssh user@host '<cmd>'` skips them.
func WrapAsLoginShell(script string) string {
	if strings.TrimSpace(script) == "" {
		return ""
	}
	return "bash -ilc " + ShellQuote(script)
}

// BuildRemoteScript composes a `cd <dir> && export FOO=bar && cmd`
// script for execution on the remote host. Empty when nothing would run.
func BuildRemoteScript(dir string, env map[string]string, cmd string) string {
	body := BuildLocalScript(env, cmd)
	if dir == "" {
		return body
	}
	cd := "cd " + QuoteRemotePath(dir)
	if body == "" {
		return cd
	}
	return cd + " && " + body
}

// BuildLocalScript renders `export FOO=bar && cmd`. Env keys are sorted
// for deterministic output.
func BuildLocalScript(env map[string]string, cmd string) string {
	var parts []string
	if len(env) > 0 {
		keys := make([]string, 0, len(env))
		for k := range env {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			parts = append(parts, fmt.Sprintf("export %s=%s", k, ShellQuote(env[k])))
		}
	}
	if cmd = strings.TrimSpace(cmd); cmd != "" {
		parts = append(parts, cmd)
	}
	return strings.Join(parts, " && ")
}

// LocalMirrorCfg returns a copy of cfg with SSH cleared and Root set to
// localRoot, so a remote project can be treated as local for the
// duration of an action that runs against an rsync mirror.
func LocalMirrorCfg(cfg *ProjectConfig, localRoot string) *ProjectConfig {
	clone := *cfg
	clone.SSH = nil
	clone.Root = localRoot
	return &clone
}

// TrimTail returns at most n trailing characters of b, prefixed with
// "..." when truncated. Used to fit subprocess error tails into toasts
// without flooding the UI.
func TrimTail(b []byte, n int) string {
	s := strings.TrimSpace(string(b))
	if len(s) <= n {
		return s
	}
	return "..." + s[len(s)-n:]
}

// RemoteLocalSpawnDir returns a real local directory for spawning a child
// process whose actual work happens on the remote (tmux pane, ssh pty).
// $HOME is preferred; cfg.Root is a fallback for ancient SSH projects
// that still have it set. Empty string only if neither is available.
func RemoteLocalSpawnDir(cfg *ProjectConfig) string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return home
	}
	return cfg.Root
}

// SSHCommandArgv returns the argv (program "ssh" included) for
// exec.Command to run cmd on the remote in cwd with env, wrapped in a
// login interactive shell. The trailing element is unquoted — argv
// elements bypass shell parsing.
func SSHCommandArgv(cfg *ProjectConfig, cwd string, env map[string]string, cmd string) []string {
	args := []string{"ssh"}
	args = append(args, SSHArgs(cfg.SSH)...)
	script := BuildRemoteScript(JoinRemoteDir(cfg.SSH.Dir, cwd), env, cmd)
	if wrapped := WrapAsLoginShell(script); wrapped != "" {
		args = append(args, wrapped)
	}
	return args
}

// SSHCommandLine returns a shell line equivalent of SSHCommandArgv: the
// trailing wrapped-script argument is single-quoted so a local shell
// (tmux send-keys, /bin/sh -c) parses it back into one argv element.
func SSHCommandLine(cfg *ProjectConfig, cwd string, env map[string]string, cmd string) string {
	args := []string{"ssh"}
	args = append(args, SSHArgs(cfg.SSH)...)
	script := BuildRemoteScript(JoinRemoteDir(cfg.SSH.Dir, cwd), env, cmd)
	if wrapped := WrapAsLoginShell(script); wrapped != "" {
		args = append(args, ShellQuote(wrapped))
	}
	return strings.Join(args, " ")
}

// ApplyDefaults layers shared defaults under the project's own entries, in
// order user-project ← <root>/.lpm.yml ← ~/.lpm/global.yml. Each layer
// flattens its own `extends:` templates first, so a sparse override
// (e.g. `myAction: {position: 3}`) can inherit cmd/cwd from a template
// referenced anywhere in the chain. The repo layer is skipped for SSH
// projects since the file lives on the remote.
func (p *ProjectConfig) ApplyDefaults() error {
	if err := flattenProjectExtends(p, filepath.Dir(ProjectPath(p.Name))); err != nil {
		return err
	}
	if !p.IsRemote() {
		repo, err := LoadRepo(p.Root)
		if err != nil {
			return err
		}
		p.Services = mergeServiceFallback(p.Services, repo.Services)
		p.Actions = mergeActionFallback(p.Actions, repo.Actions)
		p.Terminals = TerminalMap(mergeActionFallback(ActionMap(p.Terminals), ActionMap(repo.Terminals)))
		p.Profiles = mergeProfilesFallback(p.Profiles, repo.Profiles)
	}
	global, err := LoadGlobal()
	if err != nil {
		return err
	}
	p.Actions = mergeActionFallback(p.Actions, global.Actions)
	p.Terminals = TerminalMap(mergeActionFallback(ActionMap(p.Terminals), ActionMap(global.Terminals)))
	return nil
}

// ResolvedActions returns project actions merged with the terminals section;
// actions win on name collision.
func (p *ProjectConfig) ResolvedActions() ActionMap {
	out := make(ActionMap, len(p.Actions)+len(p.Terminals))
	for k, v := range p.Actions {
		out[k] = v
	}
	for k, v := range p.Terminals {
		if _, exists := out[k]; exists {
			continue
		}
		out[k] = v
	}
	return out
}

// ResolvedAction returns the named action, looking in Actions then Terminals.
// A "parent:child" name returns the parent's named child via ResolvedChild.
func (p *ProjectConfig) ResolvedAction(name string) (Action, bool) {
	parent, child, nested := strings.Cut(name, ":")
	a, ok := p.Actions[parent]
	if !ok {
		a, ok = p.Terminals[parent]
	}
	if !ok {
		return Action{}, false
	}
	if nested {
		return a.ResolvedChild(child)
	}
	return a, true
}

func (p *ProjectConfig) IsDuplicate() bool {
	return p.ParentName != ""
}

type GlobalConfig struct {
	Extends   []string    `yaml:"extends,omitempty"`
	Actions   ActionMap   `yaml:"actions,omitempty"`
	Terminals TerminalMap `yaml:"terminals,omitempty"`
}

// RepoConfig is the schema for `<root>/.lpm.yml` — a checked-in file that
// teammates share. Project-identity fields (name, root, parent_name, ssh)
// are intentionally absent; those belong to each user's project entry.
// Templates under `~/.lpm/templates/` reuse the same schema.
type RepoConfig struct {
	Extends   []string            `yaml:"extends,omitempty"`
	Services  ServiceMap          `yaml:"services,omitempty"`
	Actions   ActionMap           `yaml:"actions,omitempty"`
	Terminals TerminalMap         `yaml:"terminals,omitempty"`
	Profiles  map[string][]string `yaml:"profiles,omitempty"`
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

func TemplatesDir() string {
	return filepath.Join(LpmDir(), "templates")
}

// Resolves a bare name (no separators) to `~/.lpm/templates/<name>.yml`,
// `~`-prefixed and absolute paths as-is, and any relative path against
// `baseDir` — the directory of the file declaring `extends`.
func TemplatePath(ref, baseDir string) string {
	if strings.HasPrefix(ref, "~") {
		return ExpandHome(ref)
	}
	if filepath.IsAbs(ref) {
		return ref
	}
	if strings.ContainsAny(ref, `/\`) {
		return filepath.Join(baseDir, ref)
	}
	name := ref
	if !strings.HasSuffix(name, ".yml") && !strings.HasSuffix(name, ".yaml") {
		name += ".yml"
	}
	return filepath.Join(TemplatesDir(), name)
}

// NotesDir returns the on-disk directory that holds the encrypted notes DB
// and attachment blobs for the given project.
func NotesDir(project string) string {
	return filepath.Join(LpmDir(), "notes", project)
}

// A missing file yields an empty config; broken YAML or a bad extends ref
// returns an error.
func LoadGlobal() (*GlobalConfig, error) {
	path := GlobalPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &GlobalConfig{}, nil
		}
		return nil, fmt.Errorf("read global config: %w", err)
	}
	var cfg GlobalConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse global config: %w", err)
	}
	expandActionCwds(cfg.Actions)
	expandActionCwds(ActionMap(cfg.Terminals))
	if err := flattenGlobalExtends(&cfg, filepath.Dir(path)); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// RepoPath returns <root>/.lpm.yml — the per-repo, checked-in config file.
// Empty when root is empty (e.g. an SSH project before its remote root is
// known locally).
func RepoPath(root string) string {
	if root == "" {
		return ""
	}
	return filepath.Join(ExpandHome(root), ".lpm.yml")
}

// A missing file yields an empty config; broken YAML or a bad extends ref
// returns an error.
func LoadRepo(root string) (*RepoConfig, error) {
	path := RepoPath(root)
	if path == "" {
		return &RepoConfig{}, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &RepoConfig{}, nil
		}
		return nil, fmt.Errorf("read repo config: %w", err)
	}
	var cfg RepoConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse repo config: %w", err)
	}
	expandRepoCwds(&cfg)
	if err := flattenRepoExtends(&cfg, filepath.Dir(path), nil); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func expandRepoCwds(cfg *RepoConfig) {
	for name, svc := range cfg.Services {
		if svc.Cwd != "" {
			svc.Cwd = ExpandHome(svc.Cwd)
			cfg.Services[name] = svc
		}
	}
	expandActionCwds(cfg.Actions)
	expandActionCwds(ActionMap(cfg.Terminals))
}

// `visited` tracks absolute paths in the current load chain to detect
// cycles; pass nil at top-level entry points.
func loadTemplate(absPath string, visited map[string]bool) (*RepoConfig, error) {
	canonical, err := filepath.Abs(absPath)
	if err != nil {
		return nil, fmt.Errorf("resolve template %q: %w", absPath, err)
	}
	if visited[canonical] {
		return nil, fmt.Errorf("template extends cycle at %q", canonical)
	}
	data, err := os.ReadFile(canonical)
	if err != nil {
		return nil, fmt.Errorf("read template %q: %w", canonical, err)
	}
	var cfg RepoConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse template %q: %w", canonical, err)
	}
	expandRepoCwds(&cfg)

	if visited == nil {
		visited = map[string]bool{}
	}
	visited[canonical] = true
	defer delete(visited, canonical)

	if err := flattenRepoExtends(&cfg, filepath.Dir(canonical), visited); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func mergeRepoUnder(base, sub *RepoConfig) {
	base.Services = mergeServiceFallback(base.Services, sub.Services)
	base.Actions = mergeActionFallback(base.Actions, sub.Actions)
	base.Terminals = TerminalMap(mergeActionFallback(ActionMap(base.Terminals), ActionMap(sub.Terminals)))
	base.Profiles = mergeProfilesFallback(base.Profiles, sub.Profiles)
}

func walkExtends(refs []string, baseDir string, visited map[string]bool, apply func(*RepoConfig)) error {
	for _, ref := range refs {
		sub, err := loadTemplate(TemplatePath(ref, baseDir), visited)
		if err != nil {
			return err
		}
		apply(sub)
	}
	return nil
}

func flattenRepoExtends(base *RepoConfig, baseDir string, visited map[string]bool) error {
	if err := walkExtends(base.Extends, baseDir, visited, func(sub *RepoConfig) {
		mergeRepoUnder(base, sub)
	}); err != nil {
		return err
	}
	base.Extends = nil
	return nil
}

func flattenGlobalExtends(base *GlobalConfig, baseDir string) error {
	if err := walkExtends(base.Extends, baseDir, nil, func(sub *RepoConfig) {
		base.Actions = mergeActionFallback(base.Actions, sub.Actions)
		base.Terminals = TerminalMap(mergeActionFallback(ActionMap(base.Terminals), ActionMap(sub.Terminals)))
	}); err != nil {
		return err
	}
	base.Extends = nil
	return nil
}

// `selfPath` is the (possibly not-yet-written) absolute path of the file
// declaring `extends`, seeded into the visited set so a self-cycle is
// caught before the file hits disk.
func ValidateTemplateRefs(extends []string, selfPath string) error {
	canonical, err := filepath.Abs(selfPath)
	if err != nil {
		return fmt.Errorf("resolve %q: %w", selfPath, err)
	}
	visited := map[string]bool{canonical: true}
	baseDir := filepath.Dir(canonical)
	for _, ref := range extends {
		if _, err := loadTemplate(TemplatePath(ref, baseDir), visited); err != nil {
			return err
		}
	}
	return nil
}

func flattenProjectExtends(p *ProjectConfig, baseDir string) error {
	if err := walkExtends(p.Extends, baseDir, nil, func(sub *RepoConfig) {
		p.Services = mergeServiceFallback(p.Services, sub.Services)
		p.Actions = mergeActionFallback(p.Actions, sub.Actions)
		p.Terminals = TerminalMap(mergeActionFallback(ActionMap(p.Terminals), ActionMap(sub.Terminals)))
		p.Profiles = mergeProfilesFallback(p.Profiles, sub.Profiles)
	}); err != nil {
		return err
	}
	p.Extends = nil
	return nil
}

func EnsureDirs() error {
	if err := os.MkdirAll(ProjectsDir(), 0o755); err != nil {
		return err
	}
	return os.MkdirAll(TemplatesDir(), 0o755)
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

func ProjectExists(name string) bool {
	_, err := os.Stat(ProjectPath(name))
	return err == nil
}

// expandLocalCwds expands ~/ in service/action/terminal cwds in place.
// Skipped for SSH projects since those cwds are remote paths.
func expandLocalCwds(cfg *ProjectConfig) {
	if cfg.IsRemote() {
		return
	}
	for name, svc := range cfg.Services {
		if svc.Cwd != "" {
			svc.Cwd = ExpandHome(svc.Cwd)
			cfg.Services[name] = svc
		}
	}
	expandActionCwds(cfg.Actions)
	expandActionCwds(ActionMap(cfg.Terminals))
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

// LoadProjectRaw parses a project YAML without resolving parent configs,
// merging global actions/terminals, or running validation.
func LoadProjectRaw(name string) (*ProjectConfig, error) {
	if err := ValidateName(name); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(ProjectPath(name))
	if err != nil {
		return nil, err
	}
	var cfg ProjectConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid config for %q: %w", name, err)
	}
	cfg.normalize(name)
	expandLocalCwds(&cfg)
	return &cfg, nil
}

// normalize applies the post-unmarshal defaults shared by every loader:
// fill in name from the file id when omitted, and expand ~ in root.
func (p *ProjectConfig) normalize(name string) {
	if p.Name == "" {
		p.Name = name
	}
	p.Root = ExpandHome(p.Root)
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

	cfg.normalize(name)

	// Parent already applied ExpandHome and global merge during its own load;
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

	expandLocalCwds(&cfg)

	if err := cfg.ApplyDefaults(); err != nil {
		return nil, err
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if cache != nil {
		cache[name] = &cfg
	}
	return &cfg, nil
}

// isValidPort treats 0 as "unset" (not bound).
func isValidPort(port int) bool {
	return port >= 0 && port <= 65535
}

func (p *ProjectConfig) Validate() error {
	var errs []string

	root := ExpandHome(p.Root)
	remote := p.IsRemote()

	if p.SSH != nil {
		if strings.TrimSpace(p.SSH.Host) == "" {
			errs = append(errs, "ssh: missing host")
		}
		if strings.TrimSpace(p.SSH.User) == "" {
			errs = append(errs, "ssh: missing user")
		}
		if !isValidPort(p.SSH.Port) {
			errs = append(errs, fmt.Sprintf("ssh: invalid port %d", p.SSH.Port))
		}
		if d := strings.TrimSpace(p.SSH.Dir); d != "" && !strings.HasPrefix(d, "/") && !strings.HasPrefix(d, "~") {
			errs = append(errs, fmt.Sprintf("ssh: dir %q must be absolute or ~-prefixed", d))
		}
	}

	if !remote && strings.TrimSpace(p.Root) == "" {
		errs = append(errs, "root: missing")
	} else if !remote && root != "" {
		if info, err := os.Stat(root); err != nil || !info.IsDir() {
			errs = append(errs, fmt.Sprintf("root: directory %q does not exist", p.Root))
		}
	}

	ports := map[int]string{}
	for name, svc := range p.Services {
		if strings.TrimSpace(svc.Cmd) == "" {
			errs = append(errs, fmt.Sprintf("service %q: missing cmd", name))
		}
		if !isValidPort(svc.Port) {
			errs = append(errs, fmt.Sprintf("service %q: invalid port %d", name, svc.Port))
		}
		if svc.Port > 0 {
			if other, dup := ports[svc.Port]; dup {
				errs = append(errs, fmt.Sprintf("service %q: port %d already used by %q", name, svc.Port, other))
			}
			ports[svc.Port] = name
		}
		if !remote && svc.Cwd != "" {
			abs := ExpandHome(svc.Cwd)
			if !filepath.IsAbs(abs) {
				abs = filepath.Join(root, abs)
			}
			if info, err := os.Stat(abs); err != nil || !info.IsDir() {
				errs = append(errs, fmt.Sprintf("service %q: cwd %q does not exist", name, svc.Cwd))
			}
		}
	}

	checkRoot := root
	if remote {
		checkRoot = ""
	}
	errs = append(errs, validateActionMap(checkRoot, remote, "action", p.Actions)...)
	errs = append(errs, validateActionMap(checkRoot, remote, "terminal", ActionMap(p.Terminals))...)

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

	// Marshal a deep-copy with $HOME prefixes collapsed to ~/ so project files
	// stay portable across machines. The caller's cfg keeps its expanded paths.
	data, err := yaml.Marshal(portableCopy(cfg))
	if err != nil {
		return err
	}

	// Add blank lines before top-level sections for readability
	out := string(data)
	for _, section := range []string{"ssh", "services", "actions", "terminals", "profiles"} {
		out = strings.Replace(out, "\n"+section+":\n", "\n\n"+section+":\n", 1)
	}

	path := filepath.Join(ProjectsDir(), cfg.Name+".yml")
	return os.WriteFile(path, []byte(out), 0644)
}

// portableCopy returns a copy of cfg with every $HOME-prefixed local path
// collapsed to ~/ form. SSH projects keep service/action/terminal cwds
// verbatim since those are remote paths. Maps are rebuilt so the
// caller's cfg is never mutated.
func portableCopy(cfg *ProjectConfig) *ProjectConfig {
	mapCwd := collapseHome
	if cfg.IsRemote() {
		mapCwd = func(s string) string { return s }
	}

	out := *cfg
	out.Root = collapseHome(cfg.Root)

	if cfg.SSH != nil {
		ssh := *cfg.SSH
		ssh.Key = collapseHome(ssh.Key)
		out.SSH = &ssh
	}

	if len(cfg.Services) > 0 {
		out.Services = make(ServiceMap, len(cfg.Services))
		for k, v := range cfg.Services {
			v.Cwd = mapCwd(v.Cwd)
			out.Services[k] = v
		}
	}

	out.Actions = portableActionMap(cfg.Actions, mapCwd)
	out.Terminals = TerminalMap(portableActionMap(ActionMap(cfg.Terminals), mapCwd))
	return &out
}

// mergeActionFallback merges src (global) into dst (project) field-by-field
// when both define the same key, so a project YAML can hold a sparse entry
// like `myAction: {position: 3}` to override only layout fields and inherit
// everything else (cmd, cwd, env, ...) from global. Keys that exist only in
// src are copied as-is. Returns dst (allocated if nil and src is non-empty).
//
// Caveat: bool fields (Confirm, Reuse) treat false as "inherit", so a project
// can't sparse-override a global's true to false; redefine the action fully
// in the project to do that.
func mergeActionFallback(dst, src ActionMap) ActionMap {
	if len(src) == 0 {
		return dst
	}
	if dst == nil {
		dst = make(ActionMap, len(src))
	}
	for k, srcAct := range src {
		dstAct, exists := dst[k]
		if !exists {
			dst[k] = srcAct
			continue
		}
		dst[k] = mergeAction(dstAct, srcAct)
	}
	return dst
}

// mergeServiceFallback merges src (defaults) into dst (overrides) the same
// way mergeActionFallback merges actions: when both define the same key,
// fields set on the dst entry win and zero-valued fields inherit from src.
// Used to layer per-repo defaults under per-user project services.
func mergeServiceFallback(dst, src ServiceMap) ServiceMap {
	if len(src) == 0 {
		return dst
	}
	if dst == nil {
		dst = make(ServiceMap, len(src))
	}
	for k, srcSvc := range src {
		dstSvc, exists := dst[k]
		if !exists {
			dst[k] = srcSvc
			continue
		}
		dst[k] = mergeService(dstSvc, srcSvc)
	}
	return dst
}

func mergeService(project, fallback Service) Service {
	out := project
	if out.Cmd == "" {
		out.Cmd = fallback.Cmd
	}
	if out.Cwd == "" {
		out.Cwd = fallback.Cwd
	}
	if out.Port == 0 {
		out.Port = fallback.Port
	}
	if len(out.Env) == 0 {
		out.Env = fallback.Env
	}
	if len(out.Profiles) == 0 {
		out.Profiles = fallback.Profiles
	}
	return out
}

// mergeProfilesFallback layers profile defaults under project profiles. Each
// profile's service list is treated as an opaque slice — the project's slice
// fully replaces the fallback's when both define the same profile name.
func mergeProfilesFallback(dst, src map[string][]string) map[string][]string {
	if len(src) == 0 {
		return dst
	}
	if dst == nil {
		dst = make(map[string][]string, len(src))
	}
	for k, v := range src {
		if _, exists := dst[k]; !exists {
			dst[k] = v
		}
	}
	return dst
}

// mergeAction returns the field-level merger of project (precedence) and
// global (fallback). Zero values on the project side inherit from global.
// Children are merged recursively via mergeActionFallback.
func mergeAction(project, global Action) Action {
	out := project
	if out.Cmd == "" {
		out.Cmd = global.Cmd
	}
	if out.Label == "" {
		out.Label = global.Label
	}
	if out.Cwd == "" {
		out.Cwd = global.Cwd
	}
	if out.Port == 0 {
		out.Port = global.Port
	}
	if len(out.Env) == 0 {
		out.Env = global.Env
	}
	if !out.Confirm {
		out.Confirm = global.Confirm
	}
	if out.Display == "" {
		out.Display = global.Display
	}
	if out.Type == "" {
		out.Type = global.Type
	}
	if !out.Reuse {
		out.Reuse = global.Reuse
	}
	if out.Mode == "" {
		out.Mode = global.Mode
	}
	if out.Position == nil {
		out.Position = global.Position
	}
	if len(out.Inputs) == 0 {
		out.Inputs = global.Inputs
	}
	out.Actions = mergeActionFallback(out.Actions, global.Actions)
	return out
}

func portableActionMap(src ActionMap, mapCwd func(string) string) ActionMap {
	if len(src) == 0 {
		return nil
	}
	out := make(ActionMap, len(src))
	for k, v := range src {
		v.Cwd = mapCwd(v.Cwd)
		if len(v.Actions) > 0 {
			children := make(ActionMap, len(v.Actions))
			for ck, cv := range v.Actions {
				cv.Cwd = mapCwd(cv.Cwd)
				children[ck] = cv
			}
			v.Actions = children
		}
		out[k] = v
	}
	return out
}

// validateActionMap reports cmd/cwd/mode issues. An empty root disables
// local cwd existence checks — used for SSH projects where cwd is a
// remote path. `remote` controls whether mode: sync is allowed
// (only on SSH projects).
func validateActionMap(root string, remote bool, label string, actions ActionMap) []string {
	var errs []string
	check := func(dir string, where string) {
		if dir == "" || root == "" {
			return
		}
		abs := ExpandHome(dir)
		if !filepath.IsAbs(abs) {
			abs = filepath.Join(root, abs)
		}
		if info, err := os.Stat(abs); err != nil || !info.IsDir() {
			errs = append(errs, fmt.Sprintf("%s: cwd %q does not exist", where, dir))
		}
	}
	checkMode := func(mode, where string) {
		switch mode {
		case "", ActionModeRemote, ActionModeSync:
		default:
			errs = append(errs, fmt.Sprintf("%s: invalid mode %q (expected %q or %q)", where, mode, ActionModeRemote, ActionModeSync))
			return
		}
		if mode == ActionModeSync && !remote {
			errs = append(errs, fmt.Sprintf("%s: mode %q is only valid on SSH projects", where, ActionModeSync))
		}
	}
	checkPort := func(port int, where string) {
		if !isValidPort(port) {
			errs = append(errs, fmt.Sprintf("%s: invalid port %d", where, port))
		}
	}
	for name, act := range actions {
		where := fmt.Sprintf("%s %q", label, name)
		if strings.TrimSpace(act.Cmd) == "" && len(act.Actions) == 0 {
			errs = append(errs, fmt.Sprintf("%s: missing cmd", where))
		}
		check(act.Cwd, where)
		checkMode(act.Mode, where)
		checkPort(act.Port, where)
		for childName, child := range act.Actions {
			childWhere := fmt.Sprintf("%s.%q", where, childName)
			if strings.TrimSpace(child.Cmd) == "" {
				errs = append(errs, fmt.Sprintf("%s: missing cmd", childWhere))
			}
			check(child.Cwd, childWhere)
			checkMode(child.Mode, childWhere)
			checkPort(child.Port, childWhere)
		}
	}
	return errs
}

func expandActionCwds(actions ActionMap) {
	for name, act := range actions {
		if act.Cwd != "" {
			act.Cwd = ExpandHome(act.Cwd)
		}
		for cn, child := range act.Actions {
			if child.Cwd != "" {
				child.Cwd = ExpandHome(child.Cwd)
				act.Actions[cn] = child
			}
		}
		actions[name] = act
	}
}

func ExpandHome(path string) string {
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

// collapseHome is the inverse of ExpandHome: if path lives under $HOME, it
// replaces the prefix with ~/ so the stored value stays portable between
// machines. Paths outside $HOME, and paths already ~/-prefixed, are returned
// unchanged.
func collapseHome(path string) string {
	if path == "" {
		return path
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return path
	}
	if path == home {
		return "~"
	}
	if strings.HasPrefix(path, home+"/") {
		return "~/" + path[len(home)+1:]
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
