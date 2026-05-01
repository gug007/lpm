package portcheck

import (
	"strings"
	"testing"
)

func TestParseLsofSingleHolder(t *testing.T) {
	in := "p1234\nccode\nn*:3000\n"
	got := parseLsof(in)
	h, ok := got[3000]
	if !ok || h.PID != 1234 || h.Command != "code" {
		t.Errorf("got %+v ok=%v, want pid=1234 cmd=code", h, ok)
	}
}

func TestParseLsofMultiplePorts(t *testing.T) {
	in := strings.Join([]string{
		"p1234", "ccode", "n*:3000",
		"p5678", "cnode", "n127.0.0.1:8080",
	}, "\n")
	got := parseLsof(in)
	if h := got[3000]; h.PID != 1234 || h.Command != "code" {
		t.Errorf("port 3000 got %+v, want pid=1234 cmd=code", h)
	}
	if h := got[8080]; h.PID != 5678 || h.Command != "node" {
		t.Errorf("port 8080 got %+v, want pid=5678 cmd=node", h)
	}
}

func TestParseLsofIPv6(t *testing.T) {
	in := "p1234\nccode\nn[::1]:443\n"
	got := parseLsof(in)
	if h := got[443]; h.PID != 1234 {
		t.Errorf("port 443 got %+v, want pid=1234", h)
	}
}

func TestParseLsofMultiPortsSingleProcess(t *testing.T) {
	in := "p1234\ncservice\nn*:3000\nn*:3001\n"
	got := parseLsof(in)
	if got[3000].PID != 1234 || got[3001].PID != 1234 {
		t.Errorf("expected both 3000 and 3001 to map to PID 1234, got %+v", got)
	}
}

func TestParseLsofEmpty(t *testing.T) {
	if got := parseLsof(""); len(got) != 0 {
		t.Errorf("expected empty map, got %+v", got)
	}
}

func TestPortFromAddr(t *testing.T) {
	cases := map[string]int{
		"*:3000":         3000,
		"127.0.0.1:8080": 8080,
		"[::1]:443":      443,
		"[::]:22":        22,
	}
	for in, want := range cases {
		got, ok := portFromAddr(in)
		if !ok || got != want {
			t.Errorf("portFromAddr(%q) = %d ok=%v, want %d", in, got, ok, want)
		}
	}
	if _, ok := portFromAddr("noport"); ok {
		t.Error("expected ok=false for input without colon")
	}
}

func TestFormatNone(t *testing.T) {
	if err := Format(nil); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestFormatLpmProject(t *testing.T) {
	err := Format([]Conflict{{Service: "web", Port: 3000, LpmProject: "frontend"}})
	want := "port conflict\n  • 3000 (web) — used by lpm project \"frontend\" (run: lpm kill frontend)"
	if err == nil || err.Error() != want {
		t.Errorf("got %v, want %s", err, want)
	}
}

func TestFormatExternalProcess(t *testing.T) {
	err := Format([]Conflict{{Service: "db", Port: 5432, Holder: Holder{PID: 999, Command: "postgres"}}})
	want := "port conflict\n  • 5432 (db) — used by postgres (PID 999) (run: kill 999)"
	if err == nil || err.Error() != want {
		t.Errorf("got %v, want %s", err, want)
	}
}

func TestFormatUnknownHolder(t *testing.T) {
	err := Format([]Conflict{{Service: "api", Port: 8080}})
	want := "port conflict\n  • 8080 (api) — used by an unknown local process"
	if err == nil || err.Error() != want {
		t.Errorf("got %v, want %s", err, want)
	}
}

func TestFormatPluralizesHeading(t *testing.T) {
	err := Format([]Conflict{
		{Service: "web", Port: 3000, LpmProject: "frontend"},
		{Service: "api", Port: 8080, Holder: Holder{PID: 42, Command: "node"}},
	})
	if err == nil || !strings.HasPrefix(err.Error(), "port conflicts\n") {
		t.Errorf("expected plural heading, got: %v", err)
	}
}

func TestHolderPhrase(t *testing.T) {
	cases := []struct {
		c    Conflict
		want string
	}{
		{Conflict{LpmProject: "x"}, `lpm project "x"`},
		{Conflict{Holder: Holder{PID: 1, Command: "go"}}, "go (PID 1)"},
		{Conflict{Holder: Holder{PID: 9}}, "PID 9"},
		{Conflict{}, "an unknown local process"},
	}
	for _, tc := range cases {
		if got := tc.c.HolderPhrase(); got != tc.want {
			t.Errorf("HolderPhrase(%+v) = %q, want %q", tc.c, got, tc.want)
		}
	}
}
