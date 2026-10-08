package node

import (
	"context"
	"errors"
	"io"
	"net"
	"net/netip"
	"strconv"
	"testing"
	"time"

	"tailscale.com/ipn/ipnstate"
	"tailscale.com/tailcfg"
)

func TestFromStatusRunning(t *testing.T) {
	st := &ipnstate.Status{
		BackendState: "Running",
		Self: &ipnstate.PeerStatus{
			UserID:       7,
			DNSName:      "lpm-mac.tail1234.ts.net.",
			TailscaleIPs: []netip.Addr{netip.MustParseAddr("fd7a:115c:a1e0::1"), netip.MustParseAddr("100.101.102.103")},
		},
		User:           map[tailcfg.UserID]tailcfg.UserProfile{7: {LoginName: "me@example.com"}},
		CurrentTailnet: &ipnstate.TailnetStatus{Name: "me@example.com"},
	}
	got := FromStatus(st)
	want := Status{State: StateRunning, IP: "100.101.102.103", DNSName: "lpm-mac.tail1234.ts.net", Account: "me@example.com", Tailnet: "me@example.com"}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestFromStatusNeedsLoginHidesStaleAddress(t *testing.T) {
	st := &ipnstate.Status{
		BackendState: "NeedsLogin",
		AuthURL:      "https://login.tailscale.com/a/abc",
		Self:         &ipnstate.PeerStatus{TailscaleIPs: []netip.Addr{netip.MustParseAddr("100.64.0.9")}},
	}
	got := FromStatus(st)
	if got.State != StateNeedsLogin || got.AuthURL == "" || got.IP != "" {
		t.Fatalf("got %+v", got)
	}
}

func TestFromStatusOtherStates(t *testing.T) {
	cases := map[string]string{
		"NeedsMachineAuth": StateNeedsApproval,
		"Stopped":          StateStopped,
		"Starting":         StateStarting,
		"NoState":          StateStarting,
	}
	for backend, want := range cases {
		if got := FromStatus(&ipnstate.Status{BackendState: backend}).State; got != want {
			t.Errorf("%s: got %s, want %s", backend, got, want)
		}
	}
}

func TestPipeCarriesBothWaysAndCloses(t *testing.T) {
	a1, a2 := net.Pipe()
	b1, b2 := net.Pipe()
	go Pipe(a2, b1)
	go func() {
		buf := make([]byte, 4)
		io.ReadFull(b2, buf)
		b2.Write([]byte("pong"))
		b2.Close()
	}()
	a1.Write([]byte("ping"))
	buf := make([]byte, 4)
	if _, err := io.ReadFull(a1, buf); err != nil || string(buf) != "pong" {
		t.Fatalf("got %q, %v", buf, err)
	}
	a1.SetReadDeadline(time.Now().Add(halfCloseGrace + 2*time.Second))
	if _, err := a1.Read(buf); err == nil {
		t.Fatal("expected the far side's close to reach this side")
	}
}

func TestDialOnAnOffNodeWaitsThenFails(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := New().Dial(ctx, "100.64.0.1:1"); !errors.Is(err, ErrNotStarted) {
		t.Fatalf("got %v", err)
	}
}

func TestStoppedExplainsRequiredLogging(t *testing.T) {
	st := &ipnstate.Status{BackendState: "Stopped", Health: []string{
		"Tailscale is stopped.",
		"The local log is misconfigured: tailnet requires logging to be enabled. Remove --no-logs-no-support from tailscaled command line.",
	}}
	if got := FromStatus(st); got.State != StateStopped || got.Error != loggingRequired {
		t.Fatalf("got %+v", got)
	}
	if got := FromStatus(&ipnstate.Status{BackendState: "Stopped"}); got.Error != turnedOff {
		t.Fatalf("got %+v", got)
	}
}

func TestBridgeClosesAfterItsWindow(t *testing.T) {
	port, err := New().Bridge("100.64.0.1:1", 200*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(400 * time.Millisecond)
	if c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), time.Second); err == nil {
		c.Close()
		t.Fatal("bridge still accepting after its window")
	}
}
