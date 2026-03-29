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

func LoadProject(name string) (*ProjectConfig, error) {
	if err := ValidateName(name); err != nil {
		return nil, err
	}
	path := filepath.Join(ProjectsDir(), name+".yml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("project %q not found: %w", name, err)
	}

	var cfg ProjectConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid config for %q: %w", name, err)
	}

	cfg.Root = expandHome(cfg.Root)
	return &cfg, nil
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
