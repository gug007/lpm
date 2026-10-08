// Package node runs lpm's built-in Tailscale node: a tsnet server that joins the
// user's tailnet as a device of its own, so lpm on another device reaches this
// one with no Tailscale app installed on either.
package node

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"tailscale.com/client/local"
	"tailscale.com/envknob"
	"tailscale.com/ipn"
	"tailscale.com/ipn/ipnstate"
	"tailscale.com/tsnet"
)

const (
	StateOff           = "off"
	StateStarting      = "starting"
	StateNeedsLogin    = "needsLogin"
	StateNeedsApproval = "needsApproval"
	StateRunning       = "running"
	StateStopped       = "stopped"
	StateError         = "error"
)

// Status is what the apps show: where the node is in its lifecycle and, once
// it runs, how other devices reach it.
type Status struct {
	State   string `json:"state"`
	AuthURL string `json:"authURL,omitempty"`
	IP      string `json:"ip,omitempty"`
	DNSName string `json:"dnsName,omitempty"`
	Account string `json:"account,omitempty"`
	Tailnet string `json:"tailnet,omitempty"`
	Error   string `json:"error,omitempty"`
}

var ErrNotStarted = errors.New("built-in Tailscale is off")

type forward struct {
	target string
	ln     net.Listener
}

type Node struct {
	mu        sync.Mutex
	srv       *tsnet.Server
	lc        *local.Client
	cancel    context.CancelFunc
	status    Status
	version   uint64
	changed   chan struct{}
	ports     map[uint16]string
	listeners map[uint16]*forward
	leaving   bool
	dir       string
	hostname  string
	started   chan struct{}
}

func New() *Node {
	return &Node{
		status:    Status{State: StateOff},
		changed:   make(chan struct{}),
		ports:     map[uint16]string{},
		listeners: map[uint16]*forward{},
	}
}

// Start brings the node up from the state kept in dir. A node that has never
// signed in moves to needsLogin with a sign-in URL in its status.
func (n *Node) Start(dir, hostname string) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.srv != nil {
		return nil
	}
	n.dir, n.hostname = dir, hostname
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("could not create %s: %w", dir, err)
	}
	// lpm promises not to send usage data anywhere, so the node's own debug
	// logs stay on this device instead of going to Tailscale.
	envknob.SetNoLogsNoSupport()
	srv := &tsnet.Server{
		Dir:      dir,
		Hostname: hostname,
		UserLogf: func(string, ...any) {},
	}
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	n.srv, n.cancel, n.started = srv, cancel, started
	n.setLocked(Status{State: StateStarting})
	go n.run(ctx, srv, started)
	return nil
}

// Stop takes the node offline. It stays signed in: the next Start comes back
// without a new sign-in.
func (n *Node) Stop() {
	n.stop(StateOff)
}

// Restart brings the node back with fresh connections, for an app whose
// sockets died while it was suspended. Unlike Stop then Start, it never
// reports the node off in between, so connections made meanwhile wait for it.
func (n *Node) Restart(dir, hostname string) error {
	n.stop(StateStarting)
	return n.Start(dir, hostname)
}

func (n *Node) stop(next string) {
	n.mu.Lock()
	srv, cancel, started := n.srv, n.cancel, n.started
	n.srv, n.lc, n.cancel, n.started = nil, nil, nil, nil
	for port, f := range n.listeners {
		f.ln.Close()
		delete(n.listeners, port)
	}
	n.setLocked(Status{State: next})
	n.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if srv != nil {
		// tsnet must not be closed before or while it starts.
		<-started
		srv.Close()
	}
}

// Login asks the coordination server for a fresh sign-in URL; it lands in the
// status once the server answers. Only a signed-out node asks: on a node that
// is signed in, or still starting with saved keys, it would start a
// re-authentication.
func (n *Node) Login(ctx context.Context) error {
	lc, err := n.client(ctx)
	if err != nil {
		return err
	}
	st, err := lc.StatusWithoutPeers(ctx)
	if err != nil {
		return err
	}
	if st.BackendState != ipn.NeedsLogin.String() {
		return nil
	}
	return lc.StartLoginInteractive(ctx)
}

// Logout signs the node out and removes it from the tailnet. Signing out
// resets the node's preferences, its device name among them, so it then starts
// over: a fresh start applies them again and asks for a new sign-in URL.
func (n *Node) Logout(ctx context.Context) error {
	lc, err := n.client(ctx)
	if err != nil {
		return err
	}
	n.setLeaving(true)
	defer n.setLeaving(false)
	if err := lc.Logout(ctx); err != nil {
		return err
	}
	n.mu.Lock()
	dir, hostname := n.dir, n.hostname
	n.mu.Unlock()
	return n.Restart(dir, hostname)
}

func (n *Node) setLeaving(v bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.leaving = v
}

func (n *Node) Status() (Status, uint64) {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.status, n.version
}

// Wait returns the status once its version moves past since, or when timeout
// runs out (never, for a zero timeout).
func (n *Node) Wait(since uint64, timeout time.Duration) (Status, uint64) {
	n.mu.Lock()
	if n.version != since {
		defer n.mu.Unlock()
		return n.status, n.version
	}
	ch := n.changed
	n.mu.Unlock()
	if timeout > 0 {
		t := time.NewTimer(timeout)
		defer t.Stop()
		select {
		case <-ch:
		case <-t.C:
		}
	} else {
		<-ch
	}
	return n.Status()
}

// SetForwards makes each tailnet port connect through to its local target, so
// a server that only listens on this machine answers on the node's address.
func (n *Node) SetForwards(ports map[uint16]string) {
	n.mu.Lock()
	n.ports = map[uint16]string{}
	for p, t := range ports {
		n.ports[p] = t
	}
	srv := n.srv
	n.mu.Unlock()
	if srv != nil {
		n.relisten(srv)
	}
}

// Dial opens a connection to addr across the tailnet, waiting for the node to
// come up first.
func (n *Node) Dial(ctx context.Context, addr string) (net.Conn, error) {
	srv, err := n.awaitRunning(ctx)
	if err != nil {
		return nil, err
	}
	return srv.Dial(ctx, "tcp", addr)
}

// awaitRunning waits for the node to connect. tsnet's own wait gives up at
// once while a freshly started backend has no state yet, which is exactly
// when a phone coming back to the foreground dials.
//
// A node that is off may be mid-restart, so that waits too, up to ctx. A node
// that needs signing in (it has a sign-in URL) or an admin's approval won't
// connect on its own, so that fails at once.
func (n *Node) awaitRunning(ctx context.Context) (*tsnet.Server, error) {
	for {
		n.mu.Lock()
		srv, st, changed := n.srv, n.status, n.changed
		n.mu.Unlock()
		switch {
		case srv == nil:
		case st.State == StateRunning:
			return srv, nil
		case st.State == StateStopped, st.State == StateError:
			return nil, fmt.Errorf("built-in Tailscale isn't connected: %s", st.Error)
		case st.State == StateNeedsApproval:
			return nil, errors.New("built-in Tailscale is waiting for an admin to approve this device")
		case st.State == StateNeedsLogin && st.AuthURL != "":
			return nil, errors.New("built-in Tailscale isn't signed in")
		}
		select {
		case <-changed:
		case <-ctx.Done():
			if srv == nil {
				return nil, ErrNotStarted
			}
			return nil, ctx.Err()
		}
	}
}

// Bridge listens on a fresh loopback port for window and joins each connection
// it accepts to addr across the tailnet. Code that can only dial the OS network
// stack reaches a tailnet device through it.
func (n *Node) Bridge(addr string, window time.Duration) (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	timer := time.AfterFunc(window, func() { ln.Close() })
	go func() {
		defer timer.Stop()
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), window)
				defer cancel()
				up, err := n.Dial(ctx, addr)
				if err != nil {
					c.Close()
					return
				}
				Pipe(c, up)
			}()
		}
	}()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

func (n *Node) client(ctx context.Context) (*local.Client, error) {
	for {
		n.mu.Lock()
		lc, started := n.lc, n.srv != nil
		n.mu.Unlock()
		if !started {
			return nil, ErrNotStarted
		}
		if lc != nil {
			return lc, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
}

func (n *Node) run(ctx context.Context, srv *tsnet.Server, started chan struct{}) {
	err := srv.Start()
	close(started)
	if err != nil {
		n.fail(srv, err)
		return
	}
	lc, err := srv.LocalClient()
	if err != nil {
		n.fail(srv, err)
		return
	}
	n.mu.Lock()
	if n.srv != srv {
		n.mu.Unlock()
		return
	}
	n.lc = lc
	n.mu.Unlock()
	n.relisten(srv)
	n.refresh(ctx, srv, lc)
	go func() {
		t := time.NewTicker(15 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				n.refresh(ctx, srv, lc)
			}
		}
	}()
	for ctx.Err() == nil {
		w, err := lc.WatchIPNBus(ctx, ipn.NotifyInitialState)
		if err != nil {
			select {
			case <-ctx.Done():
			case <-time.After(time.Second):
			}
			continue
		}
		for {
			nf, err := w.Next()
			if err != nil {
				break
			}
			if nf.ErrMessage != nil && *nf.ErrMessage != "" && !requiresLogging(*nf.ErrMessage) {
				n.noteError(srv, *nf.ErrMessage)
				continue
			}
			n.refresh(ctx, srv, lc)
		}
		w.Close()
	}
}

func (n *Node) refresh(ctx context.Context, srv *tsnet.Server, lc *local.Client) {
	st, err := lc.StatusWithoutPeers(ctx)
	if err != nil {
		return
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.srv != srv {
		return
	}
	s := FromStatus(st)
	// Signing out passes through Stopped on its way to NeedsLogin; shown, it
	// would read as the tailnet blocking this device.
	if n.leaving && s.State == StateStopped {
		s = Status{State: StateNeedsLogin}
	}
	n.setLocked(s)
}

func (n *Node) fail(srv *tsnet.Server, err error) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.srv == srv {
		n.setLocked(Status{State: StateError, Error: err.Error()})
	}
}

func (n *Node) noteError(srv *tsnet.Server, msg string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.srv == srv {
		s := n.status
		s.Error = msg
		n.setLocked(s)
	}
}

func (n *Node) relisten(srv *tsnet.Server) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.srv != srv {
		return
	}
	for port, f := range n.listeners {
		if target, ok := n.ports[port]; !ok || target != f.target {
			f.ln.Close()
			delete(n.listeners, port)
		}
	}
	for port, target := range n.ports {
		if _, ok := n.listeners[port]; ok {
			continue
		}
		ln, err := srv.Listen("tcp", fmt.Sprintf(":%d", port))
		if err != nil {
			continue
		}
		n.listeners[port] = &forward{target: target, ln: ln}
		go serveForward(ln, target)
	}
}

func serveForward(ln net.Listener, target string) {
	for {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		go func() {
			up, err := net.DialTimeout("tcp", target, 10*time.Second)
			if err != nil {
				c.Close()
				return
			}
			Pipe(c, up)
		}()
	}
}

func (n *Node) setLocked(s Status) {
	if s == n.status && n.version != 0 {
		return
	}
	n.status = s
	n.version++
	close(n.changed)
	n.changed = make(chan struct{})
}

// FromStatus reduces the backend's status to the few facts the apps show.
func FromStatus(st *ipnstate.Status) Status {
	var s Status
	switch st.BackendState {
	case ipn.Running.String():
		s.State = StateRunning
	case ipn.NeedsLogin.String():
		s.State = StateNeedsLogin
		s.AuthURL = st.AuthURL
	case ipn.NeedsMachineAuth.String():
		s.State = StateNeedsApproval
	case ipn.Stopped.String():
		s.State = StateStopped
		s.Error = stoppedReason(st.Health)
	default:
		s.State = StateStarting
	}
	if st.CurrentTailnet != nil {
		s.Tailnet = st.CurrentTailnet.Name
	}
	if st.Self == nil || s.State == StateNeedsLogin {
		return s
	}
	if u, ok := st.User[st.Self.UserID]; ok {
		s.Account = u.LoginName
	}
	if s.State != StateRunning {
		return s
	}
	for _, ip := range st.Self.TailscaleIPs {
		if ip.Is4() {
			s.IP = ip.String()
			break
		}
	}
	s.DNSName = strings.TrimSuffix(st.Self.DNSName, ".")
	return s
}

const (
	loggingRequired = "Your tailnet requires network logging, which lpm's built-in Tailscale doesn't send. Use the Tailscale app on this device instead, or ask your tailnet's admin."
	turnedOff       = "Tailscale turned this device off. Check it in the Tailscale admin console."
)

// stoppedReason says why the backend won't run, in words the apps can show.
// Tailscale's own health text speaks to tailscaled's command line.
func stoppedReason(health []string) string {
	for _, h := range health {
		if requiresLogging(h) {
			return loggingRequired
		}
	}
	return turnedOff
}

func requiresLogging(msg string) bool {
	return strings.Contains(msg, "requires logging") || strings.Contains(msg, "no-logs-no-support")
}
