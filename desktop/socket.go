package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SocketServer exposes a Unix domain socket API for external tools to interact
// with the running desktop app (status badges, notifications, etc.).
type SocketServer struct {
	listener   net.Listener
	app        *App
	socketPath string
	ctx        context.Context
	cancel     context.CancelFunc
}

// SocketPath returns the default socket path at ~/.lpm/lpm.sock.
func SocketPath() string {
	return filepath.Join(config.LpmDir(), "lpm.sock")
}

// NewSocketServer creates a new SocketServer bound to the given App.
func NewSocketServer(app *App) *SocketServer {
	ctx, cancel := context.WithCancel(context.Background())
	return &SocketServer{
		app:        app,
		socketPath: SocketPath(),
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Start removes any stale socket file, binds a Unix listener, sets permissions
// to 0600, and launches the accept loop in a goroutine.
func (s *SocketServer) Start() error {
	// Remove stale socket file if it exists.
	if _, err := os.Stat(s.socketPath); err == nil {
		if err := os.Remove(s.socketPath); err != nil {
			return fmt.Errorf("failed to remove stale socket: %w", err)
		}
	}

	ln, err := net.Listen("unix", s.socketPath)
	if err != nil {
		return fmt.Errorf("failed to listen on unix socket: %w", err)
	}
	s.listener = ln

	if err := os.Chmod(s.socketPath, 0600); err != nil {
		ln.Close()
		os.Remove(s.socketPath)
		return fmt.Errorf("failed to set socket permissions: %w", err)
	}

	go s.acceptLoop()
	return nil
}

// Stop cancels the context, closes the listener, and removes the socket file.
func (s *SocketServer) Stop() {
	s.cancel()
	if s.listener != nil {
		s.listener.Close()
	}
	os.Remove(s.socketPath)
}

// acceptLoop accepts new connections until the context is cancelled or the
// listener is closed.
func (s *SocketServer) acceptLoop() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.ctx.Done():
				return
			default:
				continue
			}
		}
		go s.handleClient(conn)
	}
}

// handleClient reads newline-delimited commands from a connection, processes
// each one, and writes back the response followed by a newline.
func (s *SocketServer) handleClient(conn net.Conn) {
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		response := s.processCommand(line)
		fmt.Fprintf(conn, "%s\n", response)
	}
}

// processCommand parses and executes a single command line, returning the
// response string.
func (s *SocketServer) processCommand(line string) string {
	parts := strings.Fields(line)
	if len(parts) == 0 {
		return "ERROR: empty command"
	}

	command := strings.ToLower(parts[0])
	args := parts[1:]

	switch command {
	case "ping":
		return "PONG"

	case "set_status":
		return s.cmdSetStatus(args)

	case "clear_status":
		return s.cmdClearStatus(args)

	case "list_status":
		return s.cmdListStatus(args)

	default:
		return "ERROR: unknown command"
	}
}

// cmdSetStatus handles: set_status <project> <key> <value> [--icon=X] [--color=X] [--priority=N] [--pid=N]
func (s *SocketServer) cmdSetStatus(args []string) string {
	positional, options := parseOptions(args)
	if len(positional) < 3 {
		return "ERROR: usage: set_status <project> <key> <value> [--icon=X] [--color=X] [--priority=N] [--pid=N]"
	}

	project := positional[0]
	key := positional[1]
	value := positional[2]

	entry := StatusEntry{
		Key:       key,
		Value:     value,
		Icon:      options["icon"],
		Color:     options["color"],
		Timestamp: time.Now().UnixMilli(),
	}

	if p, ok := options["priority"]; ok {
		if n, err := strconv.Atoi(p); err == nil {
			entry.Priority = n
		}
	}
	if p, ok := options["pid"]; ok {
		if n, err := strconv.Atoi(p); err == nil {
			entry.AgentPID = n
		}
	}

	changed := s.app.statusStore.Set(project, entry)
	if changed {
		wailsRuntime.EventsEmit(s.app.ctx, "status-changed", project)
	}
	return "OK"
}

// cmdClearStatus handles: clear_status <project> <key>
func (s *SocketServer) cmdClearStatus(args []string) string {
	positional, _ := parseOptions(args)
	if len(positional) < 2 {
		return "ERROR: usage: clear_status <project> <key>"
	}

	project := positional[0]
	key := positional[1]

	if s.app.statusStore.Clear(project, key) {
		wailsRuntime.EventsEmit(s.app.ctx, "status-changed", project)
	}
	return "OK"
}

// cmdListStatus handles: list_status <project>
func (s *SocketServer) cmdListStatus(args []string) string {
	positional, _ := parseOptions(args)
	if len(positional) < 1 {
		return "ERROR: usage: list_status <project>"
	}

	project := positional[0]
	entries := s.app.statusStore.List(project)

	data, err := json.Marshal(entries)
	if err != nil {
		return fmt.Sprintf("ERROR: %v", err)
	}
	return string(data)
}

// parseOptions separates positional arguments from --key=value or --key value
// option pairs.
func parseOptions(args []string) (positional []string, options map[string]string) {
	options = make(map[string]string)

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			key := strings.TrimPrefix(arg, "--")
			if idx := strings.Index(key, "="); idx >= 0 {
				// --key=value format
				options[key[:idx]] = key[idx+1:]
			} else if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				// --key value format
				options[key] = args[i+1]
				i++
			} else {
				// --flag with no value
				options[key] = ""
			}
		} else {
			positional = append(positional, arg)
		}
	}
	return
}
