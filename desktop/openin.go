package main

import (
	"embed"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

//go:embed assets/apps/*.png
var openInIcons embed.FS

type OpenInTarget struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Icon  string `json:"icon"`
}

type targetDef struct {
	id       string
	label    string
	iconPng  string
	detect   func() string
	launch   func(appPath, projectPath string) error
	openFile func(appPath, filePath string, line, col int) error
}

func iconDataURI(name string) string {
	data, err := openInIcons.ReadFile("assets/apps/" + name)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

func appDirs() []string {
	home, _ := os.UserHomeDir()
	return []string{"/Applications", filepath.Join(home, "Applications")}
}

// expandAppCandidates maps /Applications/X.app → [/Applications/X.app, ~/Applications/X.app]
// so user-installed apps are checked alongside system-wide ones.
func expandAppCandidates(path string) []string {
	if strings.HasPrefix(path, "/Applications/") {
		home, _ := os.UserHomeDir()
		return []string{path, filepath.Join(home, "Applications", path[len("/Applications/"):])}
	}
	return []string{path}
}

func detectByPaths(paths ...string) string {
	for _, p := range paths {
		for _, cand := range expandAppCandidates(p) {
			if _, err := os.Stat(cand); err == nil {
				return cand
			}
		}
	}
	return ""
}

// detectByPrefix is a fallback for apps with variant bundle names (e.g. "Cursor Nightly.app").
func detectByPrefix(prefix string) string {
	needle := strings.ToLower(prefix)
	for _, dir := range appDirs() {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			n := strings.ToLower(e.Name())
			if strings.HasPrefix(n, needle) && strings.HasSuffix(n, ".app") {
				return filepath.Join(dir, e.Name())
			}
		}
	}
	return ""
}

func launchOpenA(appName, projectPath string) error {
	return exec.Command("open", "-a", appName, projectPath).Run()
}

func launchAppleScript(script string) error {
	return exec.Command("osascript", "-e", script).Run()
}

// appleScriptEscape escapes a string for embedding inside an AppleScript double-quoted literal.
func appleScriptEscape(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`)
}

func launchTerminalApp(_ string, projectPath string) error {
	script := fmt.Sprintf(`tell application "Terminal" to do script "cd %s; clear"`,
		appleScriptEscape(projectPath))
	if err := launchAppleScript(script); err != nil {
		return err
	}
	return launchAppleScript(`tell application "Terminal" to activate`)
}

func launchITerm(_ string, projectPath string) error {
	script := fmt.Sprintf(`tell application "iTerm"
  activate
  create window with default profile
  tell current session of current window to write text "cd %s; clear"
end tell`, appleScriptEscape(projectPath))
	return launchAppleScript(script)
}

// formatPathSpec produces "path", "path:line", or "path:line:col" depending on inputs.
// Most editors with a CLI accept this form (VS Code/Cursor/Windsurf via -g, Sublime/Zed bare).
func formatPathSpec(path string, line, col int) string {
	if line <= 0 {
		return path
	}
	if col <= 0 {
		return fmt.Sprintf("%s:%d", path, line)
	}
	return fmt.Sprintf("%s:%d:%d", path, line, col)
}

// vscodeFamilyOpenFile returns an openFile func for VS Code-derived editors that ship
// a CLI binary at <App>/Contents/Resources/app/bin/<binName> and accept `-g path:line:col`.
func vscodeFamilyOpenFile(binName string) func(string, string, int, int) error {
	return func(appPath, filePath string, line, col int) error {
		bin := filepath.Join(appPath, "Contents", "Resources", "app", "bin", binName)
		return exec.Command(bin, "-g", formatPathSpec(filePath, line, col)).Run()
	}
}

func sublimeOpenFile(appPath, filePath string, line, col int) error {
	bin := filepath.Join(appPath, "Contents", "SharedSupport", "bin", "subl")
	return exec.Command(bin, formatPathSpec(filePath, line, col)).Run()
}

func zedOpenFile(appPath, filePath string, line, col int) error {
	bin := filepath.Join(appPath, "Contents", "MacOS", "cli")
	return exec.Command(bin, formatPathSpec(filePath, line, col)).Run()
}

func launchGhostty(_ string, projectPath string) error {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	return exec.Command("open", "-na", "Ghostty.app", "--args",
		"-e", shell, "-lc", fmt.Sprintf("cd %q && exec %s", projectPath, shell)).Run()
}

// Registry order is the display order.
var targets = []targetDef{
	{
		id: "cursor", label: "Cursor", iconPng: "cursor.png",
		detect: func() string {
			if p := detectByPaths(
				"/Applications/Cursor.app",
				"/Applications/Cursor Nightly.app",
			); p != "" {
				return p
			}
			return detectByPrefix("Cursor")
		},
		launch:   func(_, path string) error { return launchOpenA("Cursor", path) },
		openFile: vscodeFamilyOpenFile("cursor"),
	},
	{
		id: "vscode", label: "VS Code", iconPng: "vscode.png",
		detect: func() string {
			return detectByPaths(
				"/Applications/Visual Studio Code.app",
				"/Applications/Code.app",
			)
		},
		launch:   func(_, path string) error { return launchOpenA("Visual Studio Code", path) },
		openFile: vscodeFamilyOpenFile("code"),
	},
	{
		id: "vscode-insiders", label: "VS Code Insiders", iconPng: "vscode-insiders.png",
		detect: func() string {
			return detectByPaths(
				"/Applications/Visual Studio Code - Insiders.app",
				"/Applications/Code - Insiders.app",
			)
		},
		launch:   func(_, path string) error { return launchOpenA("Visual Studio Code - Insiders", path) },
		openFile: vscodeFamilyOpenFile("code-insiders"),
	},
	{
		id: "windsurf", label: "Windsurf", iconPng: "windsurf.png",
		detect:   func() string { return detectByPaths("/Applications/Windsurf.app") },
		launch:   func(_, path string) error { return launchOpenA("Windsurf", path) },
		openFile: vscodeFamilyOpenFile("windsurf"),
	},
	{
		id: "zed", label: "Zed", iconPng: "zed.png",
		detect:   func() string { return detectByPaths("/Applications/Zed.app", "/Applications/Zed Preview.app") },
		launch:   func(_, path string) error { return launchOpenA("Zed", path) },
		openFile: zedOpenFile,
	},
	{
		id: "xcode", label: "Xcode", iconPng: "xcode.png",
		detect: func() string { return detectByPaths("/Applications/Xcode.app") },
		launch: func(_, path string) error { return launchOpenA("Xcode", path) },
	},
	{
		id: "sublime-text", label: "Sublime Text", iconPng: "sublime-text.png",
		detect:   func() string { return detectByPaths("/Applications/Sublime Text.app") },
		launch:   func(_, path string) error { return launchOpenA("Sublime Text", path) },
		openFile: sublimeOpenFile,
	},
	{
		id: "terminal", label: "Terminal", iconPng: "terminal.png",
		detect: func() string {
			return detectByPaths("/System/Applications/Utilities/Terminal.app", "/Applications/Utilities/Terminal.app")
		},
		launch: launchTerminalApp,
	},
	{
		id: "iterm2", label: "iTerm2", iconPng: "iterm2.png",
		detect: func() string { return detectByPaths("/Applications/iTerm.app", "/Applications/iTerm2.app") },
		launch: launchITerm,
	},
	{
		id: "ghostty", label: "Ghostty", iconPng: "ghostty.png",
		detect: func() string { return detectByPaths("/Applications/Ghostty.app") },
		launch: launchGhostty,
	},
	{
		id: "warp", label: "Warp", iconPng: "warp.png",
		detect: func() string { return detectByPaths("/Applications/Warp.app") },
		launch: func(_, path string) error { return launchOpenA("Warp", path) },
	},
	{
		id: "finder", label: "Finder", iconPng: "finder.png",
		detect: func() string { return "/System/Library/CoreServices/Finder.app" },
		launch: func(_, path string) error { return exec.Command("open", path).Run() },
	},
}

var targetsByID = func() map[string]*targetDef {
	m := make(map[string]*targetDef, len(targets))
	for i := range targets {
		m[targets[i].id] = &targets[i]
	}
	return m
}()

// Detection runs once per session — new app installs require an app restart.
var (
	listCacheMu sync.Mutex
	listCache   []OpenInTarget
)

func (a *App) ListOpenInTargets() []OpenInTarget {
	listCacheMu.Lock()
	defer listCacheMu.Unlock()
	if listCache != nil {
		return listCache
	}

	out := make([]OpenInTarget, 0, len(targets))
	for _, t := range targets {
		if t.detect() == "" {
			continue
		}
		out = append(out, OpenInTarget{
			ID:    t.id,
			Label: t.label,
			Icon:  iconDataURI(t.iconPng),
		})
	}
	listCache = out
	return out
}

func (a *App) OpenIn(targetID, projectPath string) error {
	t, ok := targetsByID[targetID]
	if !ok {
		return fmt.Errorf("unknown open-in target: %s", targetID)
	}
	appPath := t.detect()
	if appPath == "" {
		return fmt.Errorf("%s is not installed", t.label)
	}
	if projectPath == "" {
		return fmt.Errorf("empty project path")
	}
	if strings.HasPrefix(projectPath, "~/") {
		home, _ := os.UserHomeDir()
		projectPath = filepath.Join(home, projectPath[2:])
	}
	return t.launch(appPath, projectPath)
}

// FileExists reports whether absPath points to a regular file (not a directory).
// Used by the terminal link provider to filter out false-positive path matches
// before underlining them.
func (a *App) FileExists(absPath string) bool {
	if absPath == "" {
		return false
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// Cap to keep the renderer responsive — anything larger than this and the
// "open externally" path is the right answer anyway.
const readFileMaxBytes = 5 * 1024 * 1024 // 5 MiB

// ReadFile returns the contents of absPath. Errors out if the file is too
// large or doesn't exist; in those cases the modal can render a placeholder
// and prompt the user to open it externally.
func (a *App) ReadFile(absPath string) (string, error) {
	if absPath == "" {
		return "", fmt.Errorf("empty file path")
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	if int64(len(data)) > readFileMaxBytes {
		return "", fmt.Errorf("file too large to preview (%d bytes)", len(data))
	}
	return string(data), nil
}

// pickFileEditor returns the first installed target that supports openFile,
// in registry order. Used as the auto-detect fallback when no preference is set.
func pickFileEditor() *targetDef {
	for i := range targets {
		t := &targets[i]
		if t.openFile == nil {
			continue
		}
		if t.detect() != "" {
			return t
		}
	}
	return nil
}

// OpenFileInEditor opens absPath in the user's preferred editor, jumping to
// line:col when both are positive. Empty editorID auto-picks the first
// installed editor that supports file-level open. Falls back to `open path`
// when nothing better is available.
func (a *App) OpenFileInEditor(editorID, absPath string, line, col int) error {
	if absPath == "" {
		return fmt.Errorf("empty file path")
	}
	if _, err := os.Stat(absPath); err != nil {
		return fmt.Errorf("file not found: %s", absPath)
	}

	if editorID != "" {
		t, ok := targetsByID[editorID]
		if !ok {
			return fmt.Errorf("unknown editor: %s", editorID)
		}
		appPath := t.detect()
		if appPath == "" {
			return fmt.Errorf("%s is not installed", t.label)
		}
		if t.openFile != nil {
			return t.openFile(appPath, absPath, line, col)
		}
		return exec.Command("open", "-a", t.label, absPath).Run()
	}

	if t := pickFileEditor(); t != nil {
		return t.openFile(t.detect(), absPath, line, col)
	}
	return exec.Command("open", absPath).Run()
}
