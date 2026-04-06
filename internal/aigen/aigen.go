// Package aigen generates lpm project configs by shelling out to the user's
// installed AI CLI. It discovers the CLI, runs it with a schema-aware prompt,
// and extracts the resulting YAML from the output.
package aigen

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
)

type CLI string

const (
	CLIClaude   CLI = "claude"
	CLICodex    CLI = "codex"
	CLIGemini   CLI = "gemini"
	CLIOpencode CLI = "opencode"
)

const (
	maxOutputBytes     = 4 * 1024 * 1024
	maxErrorDumpBytes  = 1024
	scannerInitialSize = 64 * 1024
	scannerMaxSize     = 8 * 1024 * 1024 // claude stream-json init event can exceed 50KB
)

var allCLIs = []CLI{CLIClaude, CLICodex, CLIGemini, CLIOpencode}

func (c CLI) displayName() string {
	switch c {
	case CLIClaude:
		return "Claude"
	case CLICodex:
		return "Codex"
	case CLIGemini:
		return "Gemini"
	case CLIOpencode:
		return "OpenCode"
	}
	return string(c)
}

type ProgressFunc func(message string)

func Available() map[CLI]bool {
	out := make(map[CLI]bool, len(allCLIs))
	for _, name := range allCLIs {
		_, err := exec.LookPath(string(name))
		out[name] = err == nil
	}
	return out
}

// Detect returns the first available CLI. If preferred is non-empty, only
// that CLI is checked.
func Detect(preferred CLI) (CLI, error) {
	candidates := allCLIs
	if preferred != "" {
		if !slices.Contains(allCLIs, preferred) {
			return "", fmt.Errorf("unsupported AI CLI %q", preferred)
		}
		candidates = []CLI{preferred}
	}
	for _, name := range candidates {
		if _, err := exec.LookPath(string(name)); err == nil {
			return name, nil
		}
	}
	if preferred != "" {
		return "", fmt.Errorf("%s CLI not found in PATH. Install it or pick another", preferred)
	}
	return "", fmt.Errorf("no AI CLI found in PATH. Install Claude Code, Codex, Gemini CLI, or OpenCode")
}

const promptTemplate = `Analyze the project in the current directory and generate an lpm project manager config in YAML.

lpm is a local project manager that starts/stops dev services using config files.

Config schema:
  name: <project name>              # required
  root: <absolute path>             # required
  services:                         # required, at least one
    <service_name>:
      cmd: <shell command>          # required
      cwd: <relative or absolute>   # optional, e.g. ./backend
      port: <port number>           # optional
      env:                          # optional
        KEY: value
  profiles:                         # optional — groups of service names
    default: [svc1, svc2]
    full: [svc1, svc2, svc3]
  actions:                          # optional — one-shot commands (test, migrate, deploy)
    <action_name>: <cmd string>
    # or object form:
    <action_name>:
      cmd: <shell command>
      cwd: <optional>
      confirm: true                 # show confirmation dialog

Rules:
- Read project files (package.json, Gemfile, go.mod, requirements.txt, pyproject.toml, Cargo.toml, docker-compose.yml, Makefile, manage.py, etc.) to detect services.
- Name services descriptively: frontend, backend, api, worker, db, web, etc.
- For monorepos with separate subdirs (backend/, frontend/, apps/*, services/*), use cwd on each service to point to the subdir.
- Use scripts from package.json (prefer "dev", fall back to "start") for Node projects.
- Include common actions when scripts exist: test, lint, build, migrate, typecheck.
- Set "name" to %q and "root" to %q.
- Output ONLY raw YAML. No markdown code fences. No explanation. No preamble. No trailing text.
`

type Options struct {
	CLI         CLI
	ProjectName string
	ProjectDir  string
	ExtraPrompt string
	Progress    ProgressFunc
}

func Generate(ctx context.Context, opts Options) (string, error) {
	if opts.ProjectDir == "" {
		return "", fmt.Errorf("aigen: ProjectDir is required")
	}
	if opts.ProjectName == "" {
		return "", fmt.Errorf("aigen: ProjectName is required")
	}

	prompt := fmt.Sprintf(promptTemplate, opts.ProjectName, opts.ProjectDir)
	if extra := strings.TrimSpace(opts.ExtraPrompt); extra != "" {
		prompt += "\nAdditional user instructions (follow these precisely, they override defaults):\n" + extra + "\n"
	}

	switch opts.CLI {
	case CLIClaude:
		return generateClaude(ctx, opts, prompt)
	case CLICodex:
		return generateCodex(ctx, opts, prompt)
	case CLIGemini:
		return generateGemini(ctx, opts, prompt)
	case CLIOpencode:
		return generateOpencode(ctx, opts, prompt)
	default:
		return "", fmt.Errorf("aigen: unsupported CLI %q", opts.CLI)
	}
}

// GenerateText runs the CLI with the given prompt and streams progress via the
// callback. Returns the raw text output (no YAML extraction).
func GenerateText(ctx context.Context, cli CLI, cwd, prompt string, progress ProgressFunc) (string, error) {
	switch cli {
	case CLIClaude:
		return runClaudeStream(ctx, cwd, prompt, progress)
	case CLICodex:
		cmd := exec.CommandContext(ctx, "codex", "exec", "--sandbox", "read-only", "--skip-git-repo-check", prompt)
		return streamOutput(ctx, cwd, cmd, progress, codexProgressLine)
	case CLIGemini:
		cmd := exec.CommandContext(ctx, "gemini", "-p", prompt, "--approval-mode", "yolo")
		return streamOutput(ctx, cwd, cmd, progress, nil)
	case CLIOpencode:
		cmd := exec.CommandContext(ctx, "opencode", "run", prompt)
		return streamOutput(ctx, cwd, cmd, progress, nil)
	default:
		return "", fmt.Errorf("unsupported CLI %q", cli)
	}
}

// runClaudeStream runs Claude with stream-json, emits progress, and returns the raw result text.
func runClaudeStream(ctx context.Context, cwd, prompt string, progress ProgressFunc) (string, error) {
	name := CLIClaude.displayName()
	cmd := exec.CommandContext(ctx, "claude", "-p",
		"--verbose",
		"--output-format", "stream-json",
		"--permission-mode", "bypassPermissions",
		"--disallowedTools=Edit,Write,NotebookEdit",
		prompt)
	cmd.Dir = cwd

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("%s: stdout pipe: %w", name, err)
	}
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("%s: start: %w", name, err)
	}
	emitProgress(progress, "Starting "+name+"…")

	var result string
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, scannerInitialSize), scannerMaxSize)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		handleClaudeEvent(event, progress, &result)
	}
	if err := scanner.Err(); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return "", fmt.Errorf("%s: reading output: %w", name, err)
	}
	if err := cmd.Wait(); err != nil {
		return "", runError(ctx, name, err, &stderrBuf)
	}
	return strings.TrimSpace(result), nil
}

// streamOutput streams stdout line-by-line, emitting progress, and returns the
// full collected output. Shared by streamAndExtract and GenerateText paths.
func streamOutput(ctx context.Context, cwd string, cmd *exec.Cmd, progress ProgressFunc, filter func(string) string) (string, error) {
	name := cmd.Args[0]
	cmd.Dir = cwd

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("%s: stdout pipe: %w", name, err)
	}
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("%s: start: %w", name, err)
	}
	emitProgress(progress, "Starting "+name+"…")

	var fullOut bytes.Buffer
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, scannerInitialSize), scannerMaxSize)
	for scanner.Scan() {
		line := scanner.Text()
		if fullOut.Len() < maxOutputBytes {
			fullOut.WriteString(line)
			fullOut.WriteByte('\n')
		}
		if filter != nil {
			if msg := filter(line); msg != "" {
				emitProgress(progress, msg)
			}
		} else if trimmed := strings.TrimSpace(line); trimmed != "" {
			emitProgress(progress, truncate(trimmed, 100))
		}
	}
	if err := scanner.Err(); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return "", fmt.Errorf("%s: reading output: %w", name, err)
	}
	if err := cmd.Wait(); err != nil {
		return "", runError(ctx, name, err, &stderrBuf)
	}
	emitProgress(progress, "Done.")
	return strings.TrimSpace(fullOut.String()), nil
}

func emitProgress(fn ProgressFunc, msg string) {
	if fn != nil && msg != "" {
		fn(msg)
	}
}

// runError turns a failed cmd.Wait into a readable message, detecting ctx
// cancellation so callers don't see "signal: killed".
func runError(ctx context.Context, name string, waitErr error, stderrBuf *bytes.Buffer) error {
	if ctx.Err() != nil {
		return fmt.Errorf("%s: cancelled", name)
	}
	stderr := strings.TrimSpace(stderrBuf.String())
	if stderr != "" {
		return fmt.Errorf("%s failed: %w\n%s", name, waitErr, truncForError(stderr))
	}
	return fmt.Errorf("%s failed: %w", name, waitErr)
}

func truncForError(s string) string {
	if len(s) > maxErrorDumpBytes {
		return s[:maxErrorDumpBytes] + "\n…(truncated)"
	}
	return s
}

func generateClaude(ctx context.Context, opts Options, prompt string) (string, error) {
	result, err := runClaudeStream(ctx, opts.ProjectDir, prompt, opts.Progress)
	if err != nil {
		return "", err
	}
	yamlContent := extractYAML(result)
	if yamlContent == "" {
		return "", fmt.Errorf("no YAML found in %s output:\n%s", CLIClaude.displayName(), truncForError(result))
	}
	return yamlContent, nil
}

func handleClaudeEvent(event map[string]any, progress ProgressFunc, result *string) {
	switch event["type"] {
	case "assistant":
		msg, _ := event["message"].(map[string]any)
		content, _ := msg["content"].([]any)
		for _, c := range content {
			cm, _ := c.(map[string]any)
			if cm["type"] == "tool_use" {
				emitProgress(progress, formatToolUse(cm))
			}
		}
	case "result":
		if r, ok := event["result"].(string); ok {
			*result = r
		}
		emitProgress(progress, "Done.")
	}
}

func formatToolUse(cm map[string]any) string {
	name, _ := cm["name"].(string)
	input, _ := cm["input"].(map[string]any)
	switch name {
	case "Read":
		if p, ok := input["file_path"].(string); ok {
			return "Reading " + filepath.Base(p)
		}
		return "Reading file"
	case "Grep":
		if p, ok := input["pattern"].(string); ok {
			return "Searching: " + truncate(p, 60)
		}
		return "Searching"
	case "Glob":
		if p, ok := input["pattern"].(string); ok {
			return "Matching: " + p
		}
		return "Listing files"
	case "LS":
		if p, ok := input["path"].(string); ok {
			return "Listing " + filepath.Base(p)
		}
		return "Listing directory"
	case "Bash":
		if c, ok := input["command"].(string); ok {
			return "Running: " + truncate(c, 60)
		}
		return "Running shell"
	}
	if name != "" {
		return "Using " + name
	}
	return ""
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func streamAndExtract(ctx context.Context, opts Options, cmd *exec.Cmd, filter func(string) string) (string, error) {
	result, err := streamOutput(ctx, opts.ProjectDir, cmd, opts.Progress, filter)
	if err != nil {
		return "", err
	}
	yamlContent := extractYAML(result)
	if yamlContent == "" {
		return "", fmt.Errorf("no YAML found in %s output:\n%s", opts.CLI.displayName(), truncForError(result))
	}
	return yamlContent, nil
}

func generateCodex(ctx context.Context, opts Options, prompt string) (string, error) {
	cmd := exec.CommandContext(ctx, "codex", "exec",
		"--sandbox", "read-only",
		"--skip-git-repo-check",
		prompt)
	return streamAndExtract(ctx, opts, cmd, codexProgressLine)
}

func generateGemini(ctx context.Context, opts Options, prompt string) (string, error) {
	cmd := exec.CommandContext(ctx, "gemini",
		"-p", prompt,
		"--approval-mode", "yolo")
	return streamAndExtract(ctx, opts, cmd, nil)
}

func generateOpencode(ctx context.Context, opts Options, prompt string) (string, error) {
	// opencode run auto-approves all permissions in non-interactive mode.
	cmd := exec.CommandContext(ctx, "opencode", "run", prompt)
	return streamAndExtract(ctx, opts, cmd, nil)
}

// codexProgressLine drops session metadata and markers, keeping tool
// invocations and other signal lines.
func codexProgressLine(line string) string {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return ""
	}
	switch {
	case strings.HasPrefix(trimmed, "model:"),
		strings.HasPrefix(trimmed, "sandbox:"),
		strings.HasPrefix(trimmed, "session id:"),
		strings.HasPrefix(trimmed, "workdir:"),
		strings.HasPrefix(trimmed, "approval:"),
		strings.HasPrefix(trimmed, "provider:"),
		strings.HasPrefix(trimmed, "reasoning"):
		return ""
	case trimmed == "--------",
		trimmed == "user",
		trimmed == "codex",
		trimmed == "tokens used",
		strings.HasPrefix(trimmed, "OpenAI Codex"),
		strings.HasPrefix(trimmed, "Reading additional input"),
		strings.HasPrefix(trimmed, "Shell cwd was reset"):
		return ""
	}
	return truncate(trimmed, 100)
}

func extractYAML(out string) string {
	out = strings.TrimSpace(out)

	if idx := strings.Index(out, "```"); idx >= 0 {
		rest := out[idx+3:]
		// drop language tag on opening fence line (e.g. "yaml\n...")
		if nl := strings.Index(rest, "\n"); nl >= 0 {
			rest = rest[nl+1:]
		}
		if end := strings.Index(rest, "```"); end >= 0 {
			rest = rest[:end]
		}
		return strings.TrimSpace(rest)
	}

	for _, key := range []string{"name:", "root:", "services:"} {
		if idx := strings.Index(out, key); idx >= 0 {
			lineStart := idx
			for lineStart > 0 && out[lineStart-1] != '\n' {
				lineStart--
			}
			return strings.TrimSpace(out[lineStart:])
		}
	}
	return out
}
