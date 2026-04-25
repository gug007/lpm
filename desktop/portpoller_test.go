package main

import (
	"reflect"
	"testing"
)

func TestParseListeningPortsSS(t *testing.T) {
	out := `LISTEN 0      4096            0.0.0.0:111         0.0.0.0:*
LISTEN 0      128             127.0.0.1:631       0.0.0.0:*
LISTEN 0      511             0.0.0.0:3000        0.0.0.0:*
LISTEN 0      511             *:8080              *:*
LISTEN 0      4096            [::]:22             [::]:*
LISTEN 0      511             10.0.0.5:5432       0.0.0.0:*
`
	got := parseListeningPorts(out)
	want := []int{111, 631, 3000, 8080, 22}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ports = %v, want %v", got, want)
	}
}

func TestParseListeningPortsNetstat(t *testing.T) {
	// `netstat -tln | tail -n +3` strips the two header lines, so the
	// parser sees rows starting at "tcp        0      0 ..."
	out := `tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN
tcp        0      0 127.0.0.1:5432          0.0.0.0:*               LISTEN
tcp6       0      0 :::3000                 :::*                    LISTEN
`
	got := parseListeningPorts(out)
	want := []int{22, 5432, 3000}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ports = %v, want %v", got, want)
	}
}

func TestShouldSuggestPort(t *testing.T) {
	declared := map[int]bool{80: true}
	cases := []struct {
		port int
		want bool
	}{
		{22, false},                 // ssh — explicit skip
		{80, true},                  // declared by config — allow
		{443, false},                // <1024 and not declared — skip
		{3000, true},                // typical dev port
		{65535, true},               // top of range
		{0, false},                  // invalid
		{70000, false},              // out of range
	}
	for _, tc := range cases {
		got := shouldSuggestPort(tc.port, 22, declared)
		if got != tc.want {
			t.Errorf("shouldSuggestPort(%d) = %v, want %v", tc.port, got, tc.want)
		}
	}
}

func TestIsLocalListenAddr(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"0.0.0.0", true},
		{"127.0.0.1", true},
		{"::", true},
		{"::1", true},
		{"10.0.0.5", false},
		{"192.168.1.1", false},
	}
	for _, tc := range cases {
		if got := isLocalListenAddr(tc.host); got != tc.want {
			t.Errorf("isLocalListenAddr(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}
