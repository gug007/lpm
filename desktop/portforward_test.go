package main

import (
	"testing"
)

func TestLocalhostURLPattern(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "vite",
			in:   "  ➜  Local:   http://localhost:5173/\n",
			want: []string{"5173"},
		},
		{
			name: "next",
			in:   "ready started server on http://0.0.0.0:3000",
			want: []string{"3000"},
		},
		{
			name: "rails ipv4",
			in:   "Listening on http://127.0.0.1:3000",
			want: []string{"3000"},
		},
		{
			name: "no protocol no match",
			in:   "running on port 3000",
			want: nil,
		},
		{
			name: "https",
			in:   "Server: https://localhost:8443/",
			want: []string{"8443"},
		},
		{
			name: "remote host ignored",
			in:   "Connected to http://example.com:8080",
			want: nil,
		},
		{
			name: "multiple",
			in:   "API: http://localhost:4000  Web: http://localhost:5173",
			want: []string{"4000", "5173"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			matches := localhostURLPattern.FindAllStringSubmatch(tc.in, -1)
			got := make([]string, 0, len(matches))
			for _, m := range matches {
				got = append(got, m[1])
			}
			if len(got) != len(tc.want) {
				t.Fatalf("got %v ports, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("ports[%d]=%q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestSuggestedPortsViewFiltersDismissed(t *testing.T) {
	a := &App{
		suggested: make(map[string]map[int]bool),
		dismissed: make(map[string]map[int]bool),
		pfs:       make(map[string][]*portForward),
	}
	a.markPortSuggested("p", 3000)
	a.markPortSuggested("p", 4000)
	a.markPortSuggested("p", 5000)
	a.dismissed["p"] = map[int]bool{4000: true}
	a.pfs["p"] = []*portForward{{LocalPort: 12345, RemotePort: 5000}}

	got := a.GetSuggestedPorts("p")
	if len(got) != 1 || got[0] != 3000 {
		t.Fatalf("GetSuggestedPorts = %v, want [3000]", got)
	}
}

func TestStripANSI(t *testing.T) {
	in := "  - \x1b[1mLocal:\x1b[22m   http://\x1b[36mlocalhost\x1b[39m:3000\n"
	clean := ansiCSIPattern.ReplaceAllString(in, "")
	if !localhostURLPattern.MatchString(clean) {
		t.Fatalf("after strip, regex should match: %q", clean)
	}
}

func TestPickFreeLocalPortReturnsUsable(t *testing.T) {
	port, err := pickFreeLocalPort()
	if err != nil {
		t.Fatalf("pickFreeLocalPort: %v", err)
	}
	if port <= 0 || port > 65535 {
		t.Fatalf("port %d out of range", port)
	}
}

func TestPruneSuggestionsForPort(t *testing.T) {
	a := &App{
		suggested: map[string]map[int]bool{
			"p": {3000: true, 4000: true, 5000: true},
		},
		dismissed: make(map[string]map[int]bool),
	}
	a.pruneSuggestionsForPort("p", map[int]bool{3000: true, 5000: true})
	if a.suggested["p"][4000] {
		t.Fatal("4000 should have been pruned")
	}
	if !a.suggested["p"][3000] || !a.suggested["p"][5000] {
		t.Fatal("listening ports should remain")
	}
}
