package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"gopkg.in/yaml.v3"
)

type TemplateInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func templatePathFor(name string) (string, error) {
	if err := config.ValidateName(name); err != nil {
		return "", err
	}
	if strings.HasSuffix(name, ".yml") || strings.HasSuffix(name, ".yaml") {
		return "", fmt.Errorf("template name %q must not include a file extension", name)
	}
	return filepath.Join(config.TemplatesDir(), name+".yml"), nil
}

func (a *App) ListTemplates() ([]TemplateInfo, error) {
	dir := config.TemplatesDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []TemplateInfo{}, nil
		}
		return nil, err
	}
	out := make([]TemplateInfo, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if !strings.HasSuffix(n, ".yml") && !strings.HasSuffix(n, ".yaml") {
			continue
		}
		bare := strings.TrimSuffix(strings.TrimSuffix(n, ".yaml"), ".yml")
		if bare == "" {
			continue
		}
		out = append(out, TemplateInfo{Name: bare, Path: filepath.Join(dir, n)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// ReadTemplate returns "" for a not-yet-existing template so the editor
// can open it as a blank canvas after CreateTemplate.
func (a *App) ReadTemplate(name string) (string, error) {
	path, err := templatePathFor(name)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func (a *App) SaveTemplate(name, content string) error {
	path, err := templatePathFor(name)
	if err != nil {
		return err
	}
	var parsed config.RepoConfig
	if err := yaml.Unmarshal([]byte(content), &parsed); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	if err := config.ValidateTemplateRefs(parsed.Extends, path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := writeConfigFile(path, content); err != nil {
		return err
	}
	a.wails.Event.Emit("templates-changed")
	return nil
}

// CreateTemplate errors on collision rather than overwriting.
func (a *App) CreateTemplate(name string) error {
	path, err := templatePathFor(name)
	if err != nil {
		return err
	}
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("template %q already exists", name)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte{}, 0o644); err != nil {
		return err
	}
	a.wails.Event.Emit("templates-changed")
	return nil
}

func (a *App) DeleteTemplate(name string) error {
	path, err := templatePathFor(name)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	a.wails.Event.Emit("templates-changed")
	return nil
}

// RenameTemplate does not rewrite `extends:` refs in other configs —
// they're keyed by name and would silently break. Callers should warn
// before renaming a template that's in use.
func (a *App) RenameTemplate(oldName, newName string) error {
	if oldName == newName {
		return nil
	}
	oldPath, err := templatePathFor(oldName)
	if err != nil {
		return err
	}
	newPath, err := templatePathFor(newName)
	if err != nil {
		return err
	}
	if _, err := os.Stat(newPath); err == nil {
		return fmt.Errorf("template %q already exists", newName)
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return err
	}
	a.wails.Event.Emit("templates-changed")
	return nil
}
