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
)

// SocketServer exposes a Unix socket API for external tools (status badges,
// notifications, etc.).
type SocketServer struct {
	listener   net.Listener
	app        *App
	socketPath string
	ctx        context.Context
	cancel     context.CancelFunc
}

func SocketPath() string {
	return filepath.Join(config.LpmDir(), "lpm.sock")
}

func NewSocketServer(app *App) *SocketServer {
	ctx, cancel := context.WithCancel(context.Background())
	return &SocketServer{
		app:        app,
		socketPath: SocketPath(),
		ctx:        ctx,
		cancel:     cancel,
	}
}

func (s *SocketServer) Start() error {
	os.Remove(s.socketPath)

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

func (s *SocketServer) Stop() {
	s.cancel()
	if s.listener != nil {
		s.listener.Close()
	}
	os.Remove(s.socketPath)
}

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

func (s *SocketServer) processCommand(line string) string {
	parts := shellSplit(line)
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

// set_status <project> <key> <value> [--icon=X] [--color=X] [--priority=N] [--pid=N]
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
	if p, ok := options["pane"]; ok {
		entry.PaneID = p
	}

	changed := s.app.statusStore.Set(project, entry)
	if changed {
		s.app.wails.Event.Emit("status-changed", project)
		if (value == StatusDone || value == StatusWaiting || value == StatusError) && s.app.LoadSettings().SoundNotifications {
			s.app.wails.Event.Emit("play-sound", value)
		}
	}
	return "OK"
}

// clear_status <project> <key>
func (s *SocketServer) cmdClearStatus(args []string) string {
	positional, _ := parseOptions(args)
	if len(positional) < 2 {
		return "ERROR: usage: clear_status <project> <key>"
	}

	project := positional[0]
	key := positional[1]

	if s.app.statusStore.Clear(project, key) {
		s.app.wails.Event.Emit("status-changed", project)
	}
	return "OK"
}

// list_status <project>
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

func shellSplit(s string) []string {
	var parts []string
	var current strings.Builder
	inSingle, inDouble := false, false

	for _, r := range s {
		switch {
		case r == '\'' && !inDouble:
			inSingle = !inSingle
		case r == '"' && !inSingle:
			inDouble = !inDouble
		case r == ' ' && !inSingle && !inDouble:
			if current.Len() > 0 {
				parts = append(parts, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(r)
		}
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}

// parseOptions handles --key=value and --key value forms.
func parseOptions(args []string) (positional []string, options map[string]string) {
	options = make(map[string]string)

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			key := strings.TrimPrefix(arg, "--")
			if idx := strings.Index(key, "="); idx >= 0 {
				options[key[:idx]] = key[idx+1:]
			} else if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				options[key] = args[i+1]
				i++
			} else {
				options[key] = ""
			}
		} else {
			positional = append(positional, arg)
		}
	}
	return
}
