package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"sync/atomic"

	"github.com/creack/pty"
	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var ptyCounter atomic.Uint64

type ptySession struct {
	id  string
	pty *os.File
	cmd *exec.Cmd
}

// StartTerminal launches an interactive shell in the project's root directory
// and returns a terminal ID for subsequent operations.
func (a *App) StartTerminal(projectName string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", fmt.Errorf("load project: %w", err)
	}

	dir := cfg.Root
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

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		return "", fmt.Errorf("start pty: %w", err)
	}

	sess := &ptySession{
		id:  id,
		pty: ptmx,
		cmd: cmd,
	}

	a.ptyMu.Lock()
	a.ptySessions[id] = sess
	a.ptyMu.Unlock()

	// Read goroutine: PTY stdout -> Wails events
	// Terminates when ptmx.Read returns an error (after pty.Close in StopTerminal).
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				encoded := base64.StdEncoding.EncodeToString(buf[:n])
				runtime.EventsEmit(a.ctx, "pty-output-"+id, encoded)
			}
			if err != nil {
				break
			}
		}

		// Process exited
		exitCode := 0
		if err := cmd.Wait(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			}
		}
		runtime.EventsEmit(a.ctx, "pty-exit-"+id, exitCode)

		a.ptyMu.Lock()
		delete(a.ptySessions, id)
		a.ptyMu.Unlock()
	}()

	return id, nil
}

// WriteTerminal sends input data to the terminal's PTY.
// Data is base64-encoded to safely transport binary/ANSI sequences.
func (a *App) WriteTerminal(id string, data string) error {
	a.ptyMu.Lock()
	sess, ok := a.ptySessions[id]
	a.ptyMu.Unlock()
	if !ok {
		return fmt.Errorf("terminal not found: %s", id)
	}

	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return fmt.Errorf("decode input: %w", err)
	}

	_, err = sess.pty.Write(decoded)
	return err
}

// ResizeTerminal updates the PTY window size, triggering SIGWINCH in the shell.
func (a *App) ResizeTerminal(id string, cols int, rows int) error {
	a.ptyMu.Lock()
	sess, ok := a.ptySessions[id]
	a.ptyMu.Unlock()
	if !ok {
		return fmt.Errorf("terminal not found: %s", id)
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

	_ = sess.pty.Close()
	if sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
	}
	return nil
}
