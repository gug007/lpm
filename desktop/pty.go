package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/creack/pty"
	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/unix"
)

var ptyCounter atomic.Uint64

// Flow control constants (matching VS Code's approach)
const (
	ptyHighWatermark = 100000 // pause PTY reads after this many unacked chars
	ptyLowWatermark  = 5000  // resume PTY reads when unacked drops below this
)

type ptySession struct {
	id  string
	pty *os.File
	cmd *exec.Cmd

	// Flow control (mu protects unacked/paused only)
	mu      sync.Mutex
	cond    *sync.Cond
	unacked int
	paused  bool

	// Close protection: RLock during I/O, Lock to close.
	// Separate from mu so writes don't block the reader's flow control.
	closeMu sync.RWMutex
	closed  bool

	// Busy monitor lifecycle — closed exactly once to stop monitorBusyState.
	busyDone chan struct{}
	busyOnce sync.Once

	// Unix nanos of the most recent PTY read; read by monitorBusyState
	// to separate an idle TUI from one producing output.
	lastOutputNano atomic.Int64
}

func (s *ptySession) stopBusyMonitor() {
	s.busyOnce.Do(func() { close(s.busyDone) })
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

// StartTerminalWithConfig launches a terminal using settings from a named
// terminal config (cwd, env). Returns the terminal ID.
func (a *App) StartTerminalWithConfig(projectName string, terminalName string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}
	term, ok := cfg.Terminals[terminalName]
	if !ok {
		return "", fmt.Errorf("terminal %q not found in project %q", terminalName, projectName)
	}
	dir := cfg.Root
	if term.Cwd != "" {
		if filepath.IsAbs(term.Cwd) {
			dir = term.Cwd
		} else {
			dir = filepath.Join(cfg.Root, term.Cwd)
		}
	}
	return a.startTerminalInternal(cfg, projectName, dir, term.Env)
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
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	for k, v := range extraEnv {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		return "", fmt.Errorf("start pty: %w", err)
	}

	sess := &ptySession{
		id:       id,
		pty:      ptmx,
		cmd:      cmd,
		busyDone: make(chan struct{}),
	}
	sess.cond = sync.NewCond(&sess.mu)

	a.ptyMu.Lock()
	a.ptySessions[id] = sess
	a.ptyMu.Unlock()

	go a.monitorBusyState(sess)

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
					sess.lastOutputNano.Store(time.Now().UnixNano())
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
			runtime.EventsEmit(a.ctx, "pty-output-"+id, text)
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
		sess.stopBusyMonitor()
		runtime.EventsEmit(a.ctx, "pty-exit-"+id, exitCode)

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
	_, err := sess.pty.Write([]byte(data))
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

	sess.stopBusyMonitor()

	// Wake the reader goroutine so it can exit
	sess.mu.Lock()
	sess.paused = false
	sess.cond.Signal()
	sess.mu.Unlock()

	// Wait for in-flight writes/resizes to drain, then mark closed
	sess.closeMu.Lock()
	sess.closed = true
	sess.closeMu.Unlock()

	_ = sess.pty.Close()
	if sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
	}
	return nil
}

// monitorBusyState emits `pty-busy-{id}` on transitions. A terminal is busy
// when a child command holds the foreground pgrp AND the PTY has produced
// output recently — the recency check distinguishes a running command from
// an idle interactive app (vim, claude) that owns the foreground but is
// waiting for input.
func (a *App) monitorBusyState(sess *ptySession) {
	const (
		pollInterval   = 250 * time.Millisecond
		activityWindow = 1500 * time.Millisecond
	)
	shellPid := sess.cmd.Process.Pid
	fd := int(sess.pty.Fd())

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	var lastBusy bool
	for {
		select {
		case <-sess.busyDone:
			return
		case <-ticker.C:
			// RLock prevents a concurrent StopTerminal from closing fd mid-syscall.
			sess.closeMu.RLock()
			if sess.closed {
				sess.closeMu.RUnlock()
				return
			}
			pgid, err := unix.IoctlGetInt(fd, unix.TIOCGPGRP)
			sess.closeMu.RUnlock()
			if err != nil {
				return
			}
			busy := pgid != shellPid &&
				time.Since(time.Unix(0, sess.lastOutputNano.Load())) < activityWindow
			if busy == lastBusy {
				continue
			}
			lastBusy = busy
			runtime.EventsEmit(a.ctx, "pty-busy-"+sess.id, busy)
		}
	}
}
