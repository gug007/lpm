package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gopkg.in/yaml.v3"
)

type ImportReport struct {
	Imported     []string      `json:"imported"`
	Skipped      []string      `json:"skipped"`
	MissingRoots []MissingRoot `json:"missingRoots"`
	MissingTools []string      `json:"missingTools"`
	BackupPath   string        `json:"backupPath"`
}

type MissingRoot struct {
	Project string `json:"project"`
	Root    string `json:"root"`
}

// topLevelFiles are single-file entries included in the archive alongside
// projects/ and zdotdir/. settings.json is handled separately so per-machine
// fields can be stripped on export and preserved on import.
var topLevelFiles = []string{
	"global.yml",
	"terminals.json",
	"commit-instructions.txt",
	"pr-title-instructions.txt",
	"pr-description-instructions.txt",
}

// perMachineSettingsKeys lists settings.json fields that should not travel
// between MacBooks — window dimensions and ephemeral session state.
var perMachineSettingsKeys = []string{
	"windowWidth",
	"windowHeight",
	"sidebarWidth",
	"lastSelectedProject",
}

// recoverAs converts a panic from op into an error, so Wails method panics
// surface as toast-friendly messages instead of crashing the app.
func recoverAs(op string, dst *error) {
	if r := recover(); r != nil {
		*dst = fmt.Errorf("%s panicked: %v", op, r)
		fmt.Fprintf(os.Stderr, "lpm: %s panic: %v\n", op, r)
	}
}

// ExportConfig writes a tar.gz archive containing the portable portion of
// ~/.lpm into a user-chosen directory. Returns the full archive path, or ""
// if the user cancelled the dialog.
//
// Uses OpenDirectoryDialog instead of SaveFileDialog because the latter has
// proven flaky with compound extensions on newer macOS versions.
func (a *App) ExportConfig() (result string, err error) {
	defer recoverAs("export", &err)

	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Choose export folder",
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}
	if dir == "" {
		return "", nil
	}

	host, _ := os.Hostname()
	if host == "" {
		host = "mac"
	}
	filename := fmt.Sprintf("lpm-config-%s-%s.tar.gz", sanitizeHost(host), time.Now().Format("20060102-150405"))
	path := filepath.Join(dir, filename)

	out, err := os.Create(path)
	if err != nil {
		return "", err
	}
	gzw := gzip.NewWriter(out)
	tw := tar.NewWriter(gzw)

	writeErr := writeArchive(tw)

	if err := tw.Close(); err != nil && writeErr == nil {
		writeErr = err
	}
	if err := gzw.Close(); err != nil && writeErr == nil {
		writeErr = err
	}
	if err := out.Close(); err != nil && writeErr == nil {
		writeErr = err
	}
	if writeErr != nil {
		_ = os.Remove(path)
		return "", writeErr
	}
	return path, nil
}

func writeArchive(tw *tar.Writer) error {
	root := config.LpmDir()

	projectsDir := config.ProjectsDir()
	if info, err := os.Stat(projectsDir); err == nil && info.IsDir() {
		if err := addTree(tw, projectsDir, "projects"); err != nil {
			return err
		}
	}

	zdotSrc := filepath.Join(root, "zdotdir")
	if info, err := os.Stat(zdotSrc); err == nil && info.IsDir() {
		if err := addTree(tw, zdotSrc, "zdotdir"); err != nil {
			return err
		}
	}

	for _, name := range topLevelFiles {
		if err := addFile(tw, filepath.Join(root, name), name); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return err
		}
	}

	// settings.json is rebuilt in memory so per-machine fields can be stripped.
	if data, err := sanitizedSettings(); err == nil && data != nil {
		hdr := &tar.Header{
			Name:    "settings.json",
			Mode:    0644,
			Size:    int64(len(data)),
			ModTime: time.Now(),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if _, err := tw.Write(data); err != nil {
			return err
		}
	}
	return nil
}

// ImportConfig prompts for an archive file, snapshots the current config to a
// sibling backup dir, then merges the archive in. When overwrite is false,
// existing projects are kept and listed in Skipped.
func (a *App) ImportConfig(overwrite bool) (report *ImportReport, err error) {
	defer recoverAs("import", &err)

	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import lpm config",
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}

	tmp, err := os.MkdirTemp("", "lpm-import-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)

	if err := extractTarGz(path, tmp); err != nil {
		return nil, fmt.Errorf("extract archive: %w", err)
	}

	valid := false
	for _, n := range append([]string{"projects", "settings.json"}, topLevelFiles...) {
		if _, err := os.Stat(filepath.Join(tmp, n)); err == nil {
			valid = true
			break
		}
	}
	if !valid {
		return nil, fmt.Errorf("archive does not contain an lpm config")
	}

	backup := config.LpmDir() + ".backup-" + time.Now().Format("20060102-150405")
	if err := snapshotLpm(config.LpmDir(), backup); err != nil {
		return nil, fmt.Errorf("snapshot existing config: %w", err)
	}

	report = &ImportReport{
		Imported:     []string{},
		Skipped:      []string{},
		MissingRoots: []MissingRoot{},
		MissingTools: []string{},
		BackupPath:   backup,
	}

	if err := applyImport(tmp, overwrite, report); err != nil {
		return report, err
	}

	report.MissingRoots, report.MissingTools = detectImportIssues()

	// Clear cached project order so the frontend's next ListProjects picks up
	// the imported ordering instead of serving the old value.
	a.cacheMu.Lock()
	a.projectOrder = nil
	a.cacheMu.Unlock()

	runtime.EventsEmit(a.ctx, "projects-changed")
	return report, nil
}

// MigratePortablePaths rewrites absolute $HOME-prefixed paths in project YAMLs
// and global.yml to ~/ form, so pre-existing configs become portable across
// machines. Gated by a marker file so it runs at most once per install.
func MigratePortablePaths() error {
	markerPath := filepath.Join(config.LpmDir(), ".portable-paths-v1")
	if _, err := os.Stat(markerPath); err == nil {
		return nil
	}

	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return nil
	}

	var files []string
	files = append(files, config.GlobalPath())
	if entries, err := os.ReadDir(config.ProjectsDir()); err == nil {
		for _, e := range entries {
			if !e.IsDir() && filepath.Ext(e.Name()) == ".yml" {
				files = append(files, filepath.Join(config.ProjectsDir(), e.Name()))
			}
		}
	}

	for _, p := range files {
		if err := rewriteHomeToTilde(p, home); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
	}

	if err := config.EnsureDirs(); err != nil {
		return err
	}
	return os.WriteFile(markerPath, nil, 0644)
}

// rewriteHomeToTilde rewrites `root:` and `cwd:` YAML values that start with
// `home/` (or equal home) to `~/...` form. Only those two keys are touched so
// unrelated occurrences of the path are left alone.
func rewriteHomeToTilde(path, home string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	changed := false
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")

		var key string
		switch {
		case strings.HasPrefix(trimmed, "root:"):
			key = "root:"
		case strings.HasPrefix(trimmed, "cwd:"):
			key = "cwd:"
		default:
			continue
		}

		indent := line[:len(line)-len(trimmed)]
		value := strings.TrimSpace(trimmed[len(key):])
		if value == "" {
			continue
		}

		var quote byte
		if len(value) >= 2 && (value[0] == '\'' || value[0] == '"') && value[0] == value[len(value)-1] {
			quote = value[0]
			value = value[1 : len(value)-1]
		}

		var collapsed string
		switch {
		case value == home:
			collapsed = "~"
		case strings.HasPrefix(value, home+"/"):
			collapsed = "~/" + value[len(home)+1:]
		default:
			continue
		}

		if quote != 0 {
			collapsed = string(quote) + collapsed + string(quote)
		}
		lines[i] = indent + key + " " + collapsed
		changed = true
	}

	if !changed {
		return nil
	}

	mode := os.FileMode(0644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode()
	}
	return os.WriteFile(path, []byte(strings.Join(lines, "\n")), mode)
}

/* ── Archive helpers ─────────────────────────────────────────────── */

func addTree(tw *tar.Writer, absRoot, relRoot string) error {
	return filepath.Walk(absRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(absRoot, path)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(filepath.Join(relRoot, rel))

		if info.IsDir() {
			if rel == "." {
				return nil
			}
			hdr := &tar.Header{
				Name:     name + "/",
				Mode:     int64(info.Mode().Perm()),
				ModTime:  info.ModTime(),
				Typeflag: tar.TypeDir,
			}
			return tw.WriteHeader(hdr)
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		return addFile(tw, path, name)
	})
}

func addFile(tw *tar.Writer, abs, rel string) error {
	f, err := os.Open(abs)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	hdr := &tar.Header{
		Name:    filepath.ToSlash(rel),
		Mode:    int64(info.Mode().Perm()),
		Size:    info.Size(),
		ModTime: info.ModTime(),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	_, err = io.Copy(tw, f)
	return err
}

func extractTarGz(src, dst string) error {
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()
	gzr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gzr.Close()
	tr := tar.NewReader(gzr)

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		cleaned := filepath.Clean(hdr.Name)
		if cleaned == "." || cleaned == "" {
			continue
		}
		if filepath.IsAbs(cleaned) || strings.HasPrefix(cleaned, "..") || strings.Contains(cleaned, ".."+string(filepath.Separator)) {
			return fmt.Errorf("unsafe archive entry %q", hdr.Name)
		}
		target := filepath.Join(dst, cleaned)

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(hdr.Mode)&0777); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode)&0777)
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			if err := out.Close(); err != nil {
				return err
			}
		}
	}
}

/* ── Snapshot and apply ──────────────────────────────────────────── */

// snapshotLpm copies the current ~/.lpm tree to dst, skipping runtime-only
// entries (unix sockets).
func snapshotLpm(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := os.MkdirAll(dst, info.Mode().Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		name := e.Name()
		if name == "lpm.sock" || strings.HasSuffix(name, ".sock") {
			continue
		}
		srcPath := filepath.Join(src, name)
		dstPath := filepath.Join(dst, name)
		entryInfo, err := e.Info()
		if err != nil {
			return err
		}
		if e.IsDir() {
			if err := copyTree(srcPath, dstPath, entryInfo.Mode()); err != nil {
				return err
			}
			continue
		}
		if !entryInfo.Mode().IsRegular() {
			continue
		}
		if err := copyFile(srcPath, dstPath, entryInfo.Mode()); err != nil {
			return err
		}
	}
	return nil
}

func applyImport(tmp string, overwrite bool, report *ImportReport) error {
	dst := config.LpmDir()
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}

	// projects/
	projSrc := filepath.Join(tmp, "projects")
	if entries, err := os.ReadDir(projSrc); err == nil {
		if err := os.MkdirAll(config.ProjectsDir(), 0755); err != nil {
			return err
		}
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			if e.IsDir() || filepath.Ext(e.Name()) != ".yml" {
				continue
			}
			names = append(names, e.Name())
		}
		sort.Strings(names)
		for _, file := range names {
			name := strings.TrimSuffix(file, ".yml")
			dstFile := filepath.Join(config.ProjectsDir(), file)
			if _, err := os.Stat(dstFile); err == nil && !overwrite {
				report.Skipped = append(report.Skipped, name)
				continue
			}
			if err := copyFile(filepath.Join(projSrc, file), dstFile, 0644); err != nil {
				return err
			}
			report.Imported = append(report.Imported, name)
		}
	}

	for _, n := range topLevelFiles {
		src := filepath.Join(tmp, n)
		info, err := os.Stat(src)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		if err := copyFile(src, filepath.Join(dst, n), 0644); err != nil {
			return err
		}
	}

	if _, err := os.Stat(filepath.Join(tmp, "settings.json")); err == nil {
		if err := mergeSettingsFile(filepath.Join(tmp, "settings.json"), settingsPath()); err != nil {
			return err
		}
	}

	zdotSrc := filepath.Join(tmp, "zdotdir")
	if info, err := os.Stat(zdotSrc); err == nil && info.IsDir() {
		zdotDst := filepath.Join(dst, "zdotdir")
		dstExists := false
		if _, err := os.Stat(zdotDst); err == nil {
			dstExists = true
		}
		if !dstExists || overwrite {
			if dstExists {
				if err := os.RemoveAll(zdotDst); err != nil {
					return err
				}
			}
			if err := copyTree(zdotSrc, zdotDst, info.Mode()); err != nil {
				return err
			}
		}
	}

	return nil
}

func sanitizedSettings() ([]byte, error) {
	data, err := os.ReadFile(settingsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	for _, k := range perMachineSettingsKeys {
		delete(raw, k)
	}
	return json.MarshalIndent(raw, "", "  ")
}

func mergeSettingsFile(src, dst string) error {
	srcData, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	var incoming map[string]any
	if err := json.Unmarshal(srcData, &incoming); err != nil {
		return err
	}

	current := map[string]any{}
	if data, err := os.ReadFile(dst); err == nil {
		_ = json.Unmarshal(data, &current)
	}

	keep := map[string]any{}
	for _, k := range perMachineSettingsKeys {
		if v, ok := current[k]; ok {
			keep[k] = v
		}
	}

	for k, v := range incoming {
		current[k] = v
	}
	for k, v := range keep {
		current[k] = v
	}

	out, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(dst, out, 0644)
}

// detectImportIssues walks every project YAML (via LoadProjectRaw so missing
// dependencies don't fail the scan) and the global config once, returning
// project roots that don't exist on disk and shell tools referenced by
// commands but not found in PATH. Single pass replaces two independent
// scans that used to re-read each YAML twice.
func detectImportIssues() ([]MissingRoot, []string) {
	missingRoots := []MissingRoot{}
	missingTools := []string{}
	seenTools := map[string]bool{}

	considerTool := func(cmd string) {
		_, tool := programToken(strings.Fields(cmd))
		if tool == "" || seenTools[tool] || strings.Contains(tool, "/") {
			return
		}
		seenTools[tool] = true
		if _, err := exec.LookPath(tool); err != nil {
			missingTools = append(missingTools, tool)
		}
	}

	names, _ := config.ListProjects()
	for _, name := range names {
		cfg, err := config.LoadProjectRaw(name)
		if err != nil {
			continue
		}
		if cfg.Root != "" {
			if info, err := os.Stat(cfg.Root); err != nil || !info.IsDir() {
				missingRoots = append(missingRoots, MissingRoot{Project: name, Root: cfg.Root})
			}
		}
		for _, s := range cfg.Services {
			considerTool(s.Cmd)
		}
		walkActionCmds(cfg.Actions, considerTool)
		walkActionCmds(config.ActionMap(cfg.Terminals), considerTool)
	}

	if data, err := os.ReadFile(config.GlobalPath()); err == nil {
		var g config.GlobalConfig
		if err := yaml.Unmarshal(data, &g); err == nil {
			walkActionCmds(g.Actions, considerTool)
			walkActionCmds(config.ActionMap(g.Terminals), considerTool)
		}
	}

	sort.Slice(missingRoots, func(i, j int) bool { return missingRoots[i].Project < missingRoots[j].Project })
	sort.Strings(missingTools)
	return missingRoots, missingTools
}

func walkActionCmds(m config.ActionMap, fn func(string)) {
	for _, act := range m {
		fn(act.Cmd)
		for _, c := range act.Actions {
			fn(c.Cmd)
		}
	}
}

func sanitizeHost(host string) string {
	var b strings.Builder
	for _, r := range host {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := b.String()
	if out == "" {
		return "mac"
	}
	return out
}
