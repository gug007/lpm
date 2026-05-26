package main

import (
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/creack/pty"
	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/portcheck"
)

// Wails v2 WKWebView IPC drops certain high bytes (notably 0xD1) in JS→Go
// string transit on some macOS configs. Frontend hex-encodes input containing
// non-ASCII bytes with this marker prefix; ASCII passes through unchanged.
const writeTerminalHexMarker = "\x00HEX:"

var ptyCounter atomic.Uint64

const (
	ptyHighWatermark = 100000 // pause PTY reads after this many unacked chars
	ptyLowWatermark  = 5000   // resume when unacked drops below this
)

type ptySession struct {
	id          string
	projectName string
	declared    map[int]bool // service ports declared in cfg; nil for local projects
	// remote is cfg.IsRemote() at start time (post-sync-mirror): true when
	// the shell runs on the SSH host. File drops/pastes consult this to
	// decide whether to upload.
	remote bool
	ssh    *config.SSHSettings // nil if !remote
	pty    *os.File
	cmd    *exec.Cmd

	// onClose runs in a goroutine after the process exits. Used by mode:
	// sync terminals to push the rsync mirror back.
	onClose func()

	// mu protects unacked/paused only.
	mu      sync.Mutex
	cond    *sync.Cond
	unacked int
	paused  bool

	// closeMu: RLock during I/O, Lock to close. Separate from mu so writes
	// don't block the reader's flow control.
	closeMu sync.RWMutex
	closed  bool
}

func (s *ptySession) addUnacked(n int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.unacked += n
	if !s.paused && s.unacked > ptyHighWatermark {
		s.paused = true
	}
}

func (s *ptySession) wake() {
	s.mu.Lock()
	s.paused = false
	s.cond.Signal()
	s.mu.Unlock()
}

func (a *App) StartTerminal(projectName string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}
	return a.startTerminalInternal(cfg, projectName, "", nil, nil)
}

// StartTerminalWithCwdEnv launches a terminal with explicit cwd and env.
// cwd is project-relative; SSH projects resolve it against ssh.dir.
func (a *App) StartTerminalWithCwdEnv(projectName string, cwd string, env map[string]string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}
	return a.startTerminalInternal(cfg, projectName, cwd, env, nil)
}

// TerminalLaunch is the result of StartTerminalForConfig: PTY id, the
// command to type now, and (if recognised) the resume form for next launch.
type TerminalLaunch struct {
	ID        string `json:"id"`
	StartCmd  string `json:"startCmd"`
	ResumeCmd string `json:"resumeCmd,omitempty"`
}

// StartTerminalForConfig launches a named terminal config and runs cmd
// through the resume registry. When the leading program is recognised
// (e.g. claude), StartCmd is rewritten with a fresh session id and
// ResumeCmd carries the matching --resume form; otherwise ResumeCmd is
// empty and the frontend should not persist either field.
func (a *App) StartTerminalForConfig(projectName string, terminalName string) (TerminalLaunch, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return TerminalLaunch{}, fmt.Errorf("load project: %w", err)
	}
	act, ok := cfg.ResolvedAction(terminalName)
	if !ok || act.Type != "terminal" {
		return TerminalLaunch{}, fmt.Errorf("terminal %q not found in project %q", terminalName, projectName)
	}

	if err := portcheck.FormatActionPort(terminalName, act.Port); err != nil {
		return TerminalLaunch{}, err
	}

	// mode: sync runs the terminal locally against an rsync mirror of
	// ssh.dir; on exit we push edits back to the remote.
	spawnCfg := cfg
	var onClose func()
	if cfg.IsRemote() && act.Mode == config.ActionModeSync {
		local, err := a.ensureProjectSync(cfg)
		if err != nil {
			return TerminalLaunch{}, err
		}
		spawnCfg = config.LocalMirrorCfg(cfg, local)
		onClose = func() { a.pushProjectSyncAsync(cfg) }
	}

	id, err := a.startTerminalInternal(spawnCfg, projectName, act.Cwd, act.Env, onClose)
	if err != nil {
		return TerminalLaunch{}, err
	}

	startCmd, resumeCmd := resolveRestoreCmds(act.Cmd)
	return TerminalLaunch{ID: id, StartCmd: startCmd, ResumeCmd: resumeCmd}, nil
}

// StartTerminalForRestore skips the port check and resume-id rewrite
// (frontend re-injects the persisted resumeCmd), and falls back to a plain
// shell if the action was renamed or removed since persist.
func (a *App) StartTerminalForRestore(projectName string, terminalName string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}
	act, ok := cfg.ResolvedAction(terminalName)
	if !ok || act.Type != "terminal" {
		return a.startTerminalInternal(cfg, projectName, "", nil, nil)
	}

	spawnCfg := cfg
	var onClose func()
	if cfg.IsRemote() && act.Mode == config.ActionModeSync {
		local, err := a.ensureProjectSync(cfg)
		if err != nil {
			return "", err
		}
		spawnCfg = config.LocalMirrorCfg(cfg, local)
		onClose = func() { a.pushProjectSyncAsync(cfg) }
	}

	return a.startTerminalInternal(spawnCfg, projectName, act.Cwd, act.Env, onClose)
}

// buildTerminalCmd produces the *exec.Cmd to spawn under a PTY. For SSH
// projects, extraEnv is baked into the remote script. Local projects ignore
// extraEnv here — startTerminalInternal applies it to the local process env.
func buildTerminalCmd(cfg *config.ProjectConfig, rawCwd string, extraEnv map[string]string) (*exec.Cmd, error) {
	if cfg.IsRemote() {
		// SSH doesn't forward TERM_PROGRAM, so cmd.Env settings don't reach
		// the remote shell. Bake it into the script so TUIs like Claude
		// Code detect kitty-keyboard support and recognise Shift+Enter.
		remoteEnv := map[string]string{"TERM_PROGRAM": "kitty"}
		for k, v := range extraEnv {
			remoteEnv[k] = v
		}
		argv := config.SSHCommandArgv(cfg, rawCwd, remoteEnv, `exec "$SHELL" -l`)
		cmd := exec.Command(argv[0], argv[1:]...)
		cmd.Dir = config.RemoteLocalSpawnDir(cfg)
		return cmd, nil
	}

	dir := config.ResolveCwd(cfg.Root, rawCwd)
	if dir == "" {
		return nil, fmt.Errorf("project has no root directory")
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	cmd := exec.Command(shell, "-l")
	cmd.Dir = dir
	return cmd, nil
}

func (a *App) startTerminalInternal(cfg *config.ProjectConfig, projectName string, rawCwd string, extraEnv map[string]string, onClose func()) (string, error) {
	id := fmt.Sprintf("%s-%d", projectName, ptyCounter.Add(1))
	cmd, err := buildTerminalCmd(cfg, rawCwd, extraEnv)
	if err != nil {
		return "", err
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "TERM_PROGRAM=kitty")
	cmd.Env = append(cmd.Env, "LPM_SOCKET_PATH="+SocketPath())
	cmd.Env = append(cmd.Env, "LPM_PROJECT_NAME="+projectName)
	cmd.Env = append(cmd.Env, "LPM_PANE_ID="+id)
	if !cfg.IsRemote() {
		for k, v := range extraEnv {
			cmd.Env = append(cmd.Env, k+"="+v)
		}
	}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		return "", fmt.Errorf("start pty: %w", err)
	}

	var declared map[int]bool
	if cfg.IsRemote() {
		declared = declaredServicePorts(cfg)
	}
	sess := &ptySession{
		id:          id,
		projectName: projectName,
		declared:    declared,
		remote:      cfg.IsRemote(),
		pty:         ptmx,
		cmd:         cmd,
		onClose:     onClose,
	}
	if sess.remote {
		sess.ssh = cfg.SSH
	}
	sess.cond = sync.NewCond(&sess.mu)

	a.ptyMu.Lock()
	a.ptySessions[id] = sess
	a.ptyMu.Unlock()

	// PTY bytes → UTF-8 strings → Wails events. Reader → channel →
	// coalescer pattern with flow control.
	go func() {
		type readResult struct {
			data []byte
			err  error
		}
		ch := make(chan readResult, 8)

		go func() {
			buf := make([]byte, 16384)
			for {
				n, err := ptmx.Read(buf)
				if n > 0 {
					cp := make([]byte, n)
					copy(cp, buf[:n])
					ch <- readResult{data: cp}
				}
				if err != nil {
					ch <- readResult{err: err}
					return
				}
				sess.mu.Lock()
				for sess.paused {
					sess.cond.Wait()
				}
				sess.mu.Unlock()
			}
		}()

		// One-shot timer so idle terminals have zero overhead.
		pending := make([]byte, 0, 65536)
		flushTimer := time.NewTimer(0)
		if !flushTimer.Stop() {
			<-flushTimer.C
		}
		timerRunning := false

		flush := func() {
			if len(pending) == 0 {
				return
			}
			// Replace invalid UTF-8 so JSON serialization is safe.
			text := strings.ToValidUTF8(string(pending), "\uFFFD")
			a.wails.Event.Emit("pty-output-"+id, text)
			a.sniffPortsFromOutput(sess.projectName, sess.declared, text)
			pending = pending[:0]
			timerRunning = false
			sess.addUnacked(utf8.RuneCountInString(text))
		}

	loop:
		for {
			select {
			case r := <-ch:
				if r.err != nil {
					flush()
					break loop
				}
				pending = append(pending, r.data...)
				if len(pending) >= 32768 {
					flush()
					if timerRunning {
						flushTimer.Stop()
						timerRunning = false
					}
				} else if !timerRunning {
					flushTimer.Reset(4 * time.Millisecond)
					timerRunning = true
				}
			case <-flushTimer.C:
				timerRunning = false
				flush()
			}
		}

		exitCode := 0
		if err := cmd.Wait(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			}
		}
		a.wails.Event.Emit("pty-exit-"+id, exitCode)

		if sess.onClose != nil {
			go sess.onClose()
		}

		a.ptyMu.Lock()
		delete(a.ptySessions, id)
		a.ptyMu.Unlock()
	}()

	return id, nil
}

func (a *App) WriteTerminal(id string, data string) error {
	a.ptyMu.Lock()
	sess, ok := a.ptySessions[id]
	a.ptyMu.Unlock()
	if !ok {
		return fmt.Errorf("terminal not found: %s", id)
	}

	sess.closeMu.RLock()
	defer sess.closeMu.RUnlock()
	if sess.closed {
		return fmt.Errorf("terminal closed: %s", id)
	}

	var buf []byte
	if strings.HasPrefix(data, writeTerminalHexMarker) {
		decoded, err := hex.DecodeString(data[len(writeTerminalHexMarker):])
		if err != nil {
			return fmt.Errorf("decode hex: %w", err)
		}
		buf = decoded
	} else {
		buf = []byte(data)
	}
	_, err := sess.pty.Write(buf)
	return err
}

// AckTerminalData acknowledges processed characters so the PTY reader
// resumes if paused.
func (a *App) AckTerminalData(id string, charCount int) error {
	a.ptyMu.Lock()
	sess, ok := a.ptySessions[id]
	a.ptyMu.Unlock()
	if !ok {
		return nil
	}

	sess.mu.Lock()
	defer sess.mu.Unlock()
	sess.unacked -= charCount
	if sess.unacked < 0 {
		sess.unacked = 0
	}
	if sess.paused && sess.unacked < ptyLowWatermark {
		sess.paused = false
		sess.cond.Signal()
	}
	return nil
}

// IsTerminalRemote reports whether the shell is running on the SSH host.
// False for unknown ids, local panes, and sync-mode panes.
func (a *App) IsTerminalRemote(id string) bool {
	a.ptyMu.Lock()
	defer a.ptyMu.Unlock()
	sess, ok := a.ptySessions[id]
	if !ok {
		return false
	}
	return sess.remote
}

func (a *App) ResizeTerminal(id string, cols int, rows int) error {
	a.ptyMu.Lock()
	sess, ok := a.ptySessions[id]
	a.ptyMu.Unlock()
	if !ok {
		return fmt.Errorf("terminal not found: %s", id)
	}

	sess.closeMu.RLock()
	defer sess.closeMu.RUnlock()
	if sess.closed {
		return fmt.Errorf("terminal closed: %s", id)
	}
	return pty.Setsize(sess.pty, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

// close tears down a session: wake paused reader, block new I/O via
// closeMu, then close the PTY and kill the shell. Safe once the session
// has been removed from App.ptySessions.
func (s *ptySession) close() {
	s.mu.Lock()
	s.paused = false
	s.cond.Signal()
	s.mu.Unlock()

	s.closeMu.Lock()
	s.closed = true
	s.closeMu.Unlock()

	_ = s.pty.Close()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
}

func (a *App) StopTerminal(id string) error {
	a.ptyMu.Lock()
	sess, ok := a.ptySessions[id]
	if ok {
		delete(a.ptySessions, id)
	}
	a.ptyMu.Unlock()

	if !ok {
		return nil
	}
	sess.close()
	return nil
}

// stopProjectTerminals closes every PTY for projectName so shells release
// file handles before the project's folder is deleted.
func (a *App) stopProjectTerminals(projectName string) {
	a.ptyMu.Lock()
	matched := make([]*ptySession, 0)
	for id, sess := range a.ptySessions {
		if sess.projectName == projectName {
			matched = append(matched, sess)
			delete(a.ptySessions, id)
		}
	}
	a.ptyMu.Unlock()

	for _, sess := range matched {
		sess.close()
	}
}

// ReadClipboardFiles returns file paths from the macOS clipboard, or nil
// when the clipboard has no file references.
func (a *App) ReadClipboardFiles() ([]string, error) {
	script := `use framework "AppKit"
set pb to current application's NSPasteboard's generalPasteboard()
set fileType to current application's NSPasteboardTypeFileURL
if not (pb's canReadItemWithDataConformingToTypes:{fileType}) as boolean then return ""
set urls to pb's readObjectsForClasses:{current application's NSURL} options:(missing value)
if urls is missing value or (count of urls) = 0 then return ""
set paths to {}
repeat with u in urls
if (u's isFileURL() as boolean) then copy (u's |path|() as text) to end of paths
end repeat
set AppleScript's text item delimiters to (character id 10)
return paths as text`

	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return nil, nil
	}
	text := strings.TrimSpace(string(out))
	if text == "" {
		return nil, nil
	}
	return strings.Split(text, "\n"), nil
}

// SaveClipboardImage writes base64-encoded image data to a temp file and
// returns the path. Used to turn clipboard image paste into a file path
// insertable into the terminal.
func (a *App) SaveClipboardImage(b64Data string, mimeType string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64Data)
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}

	ext := ".png"
	switch mimeType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/bmp":
		ext = ".bmp"
	}

	f, err := os.CreateTemp("", "clipboard-*"+ext)
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(data); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("write temp file: %w", err)
	}
	return f.Name(), nil
}
