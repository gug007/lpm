package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

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

type ProjectConfig struct {
	Name     string              `yaml:"name"`
	Root     string              `yaml:"root"`
	Services map[string]Service  `yaml:"services"`
	Profiles map[string][]string `yaml:"profiles,omitempty"`
}

func LpmDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".lpm")
}

func ProjectsDir() string {
	return filepath.Join(LpmDir(), "projects")
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
	for name, svc := range cfg.Services {
		if svc.Cwd != "" {
			svc.Cwd = expandHome(svc.Cwd)
			cfg.Services[name] = svc
		}
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (p *ProjectConfig) Validate() error {
	var errs []string

	if len(p.Services) == 0 {
		errs = append(errs, "no services defined")
	}

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

func SaveProject(cfg *ProjectConfig) error {
	if err := EnsureDirs(); err != nil {
		return err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}

	path := filepath.Join(ProjectsDir(), cfg.Name+".yml")
	return os.WriteFile(path, data, 0644)
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

	// No profiles defined — return all services
	var all []string
	for name := range p.Services {
		all = append(all, name)
	}
	return all
}
