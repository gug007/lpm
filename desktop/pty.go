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
)

// Wails v2 WKWebView IPC drops certain high bytes (notably 0xD1) in JS→Go
// string transit on some macOS configs. Frontend hex-encodes input containing
// non-ASCII bytes with this marker prefix; ASCII passes through unchanged.
const writeTerminalHexMarker = "\x00HEX:"

var ptyCounter atomic.Uint64

// Flow control constants (matching VS Code's approach)
const (
	ptyHighWatermark = 100000 // pause PTY reads after this many unacked chars
	ptyLowWatermark  = 5000  // resume PTY reads when unacked drops below this
)

type ptySession struct {
	id          string
	projectName string
	pty         *os.File
	cmd         *exec.Cmd

	// Flow control (mu protects unacked/paused only)
	mu      sync.Mutex
	cond    *sync.Cond
	unacked int
	paused  bool

	// Close protection: RLock during I/O, Lock to close.
	// Separate from mu so writes don't block the reader's flow control.
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

// StartTerminal launches an interactive shell in the project's root directory
// and returns a terminal ID for subsequent operations.
func (a *App) StartTerminal(projectName string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}
	return a.startTerminalInternal(cfg, projectName, cfg.Root, nil)
}

// StartTerminalWithCwdEnv launches a terminal with explicit cwd and env overrides.
// Used by terminal-type actions that specify their own cwd/env.
func (a *App) StartTerminalWithCwdEnv(projectName string, cwd string, env map[string]string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}
	return a.startTerminalInternal(cfg, projectName, config.ResolveCwd(cfg.Root, cwd), env)
}

// TerminalLaunch is what StartTerminalForConfig hands back: a fresh PTY
// id, the command to type into it now, and — when the program is known
// to the resume registry — a resume command to type on the next app
// launch instead.
type TerminalLaunch struct {
	ID        string `json:"id"`
	StartCmd  string `json:"startCmd"`
	ResumeCmd string `json:"resumeCmd,omitempty"`
}

// StartTerminalForConfig launches a named terminal config in its own
// cwd/env and runs the cmd through the resume registry. If the leading
// program is recognized (e.g. claude), StartCmd is rewritten with a
// fresh session id and ResumeCmd carries the matching --resume form;
// otherwise StartCmd is the original cmd and ResumeCmd is empty and the
// frontend should not persist either field.
func (a *App) StartTerminalForConfig(projectName string, terminalName string) (TerminalLaunch, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return TerminalLaunch{}, fmt.Errorf("load project: %w", err)
	}
	act, ok := cfg.ResolvedAction(terminalName)
	if !ok || act.Type != "terminal" {
		return TerminalLaunch{}, fmt.Errorf("terminal %q not found in project %q", terminalName, projectName)
	}

	id, err := a.startTerminalInternal(cfg, projectName, config.ResolveCwd(cfg.Root, act.Cwd), act.Env)
	if err != nil {
		return TerminalLaunch{}, err
	}

	startCmd, resumeCmd := resolveRestoreCmds(act.Cmd)
	return TerminalLaunch{ID: id, StartCmd: startCmd, ResumeCmd: resumeCmd}, nil
}

func (a *App) startTerminalInternal(cfg *config.ProjectConfig, projectName string, dir string, extraEnv map[string]string) (string, error) {
	if dir == "" {
		dir = cfg.Root
	}
	if dir == "" {
		return "", fmt.Errorf("project has no root directory")
	}

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	id := fmt.Sprintf("%s-%d", projectName, ptyCounter.Add(1))

	cmd := exec.Command(shell, "-l")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "TERM_PROGRAM=kitty")
	// Inject LPM environment variables for external tool integration
	cmd.Env = append(cmd.Env, "LPM_SOCKET_PATH="+SocketPath())
	cmd.Env = append(cmd.Env, "LPM_PROJECT_NAME="+projectName)
	cmd.Env = append(cmd.Env, "LPM_PANE_ID="+id)
	for k, v := range extraEnv {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		return "", fmt.Errorf("start pty: %w", err)
	}

	sess := &ptySession{
		id:          id,
		projectName: projectName,
		pty:         ptmx,
		cmd:         cmd,
	}
	sess.cond = sync.NewCond(&sess.mu)

	a.ptyMu.Lock()
	a.ptySessions[id] = sess
	a.ptyMu.Unlock()

	// Read goroutine: PTY bytes → UTF-8 strings → Wails events.
	// Uses a reader → channel → coalescer pattern with flow control.
	go func() {
		type readResult struct {
			data []byte
			err  error
		}
		ch := make(chan readResult, 8)

		// Reader goroutine: blocking reads from PTY, pauses on back-pressure
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
				// Flow control: block if paused until ack resumes us
				sess.mu.Lock()
				for sess.paused {
					sess.cond.Wait()
				}
				sess.mu.Unlock()
			}
		}()

		// Coalescer: batches data, decodes UTF-8, flushes as strings.
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
			// Replace invalid UTF-8 so JSON serialization is safe
			text := strings.ToValidUTF8(string(pending), "\uFFFD")
			a.emit("pty-output-"+id, text)
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

		// Process exited
		exitCode := 0
		if err := cmd.Wait(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			}
		}
		a.emit("pty-exit-"+id, exitCode)

		a.ptyMu.Lock()
		delete(a.ptySessions, id)
		a.ptyMu.Unlock()
	}()

	return id, nil
}

// WriteTerminal sends input data to the terminal's PTY as a raw string.
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

// AckTerminalData acknowledges that the frontend has processed charCount
// characters, allowing the PTY reader to resume if paused.
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

// ResizeTerminal updates the PTY window size, triggering SIGWINCH in the shell.
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

// close tears down a single session: wake any paused reader, block new
// I/O via closeMu, then close the PTY and kill the shell. Safe to call
// once the session has been removed from App.ptySessions.
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

// StopTerminal closes a terminal session and kills the shell process.
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

// stopProjectTerminals closes every PTY belonging to projectName so its
// shells release file handles before the project's folder is deleted.
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

// ReadClipboardFiles returns file paths currently on the macOS clipboard.
// Returns nil when the clipboard does not contain file references.
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
// returns the file path. The frontend uses this to turn clipboard image
// paste into a file path that can be inserted into the terminal.
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
