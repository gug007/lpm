package main

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// SSHConfigHost is one named host parsed from ~/.ssh/config — a candidate
// the New SSH Project dialog can pre-fill from. Name is the alias the user
// wrote after `Host`; HostName is the actual address from the optional
// `HostName` directive (falls back to Name when absent).
type SSHConfigHost struct {
	Name         string `json:"name"`
	HostName     string `json:"hostName"`
	User         string `json:"user"`
	Port         int    `json:"port"`
	IdentityFile string `json:"identityFile"`
}

// ListSSHHosts returns non-wildcard hosts from ~/.ssh/config (and any
// `Include`d files) for the dialog's host picker. A missing config file is
// not an error — the picker just shows nothing.
func (a *App) ListSSHHosts() ([]SSHConfigHost, error) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return []SSHConfigHost{}, nil
	}
	hosts, err := parseSSHConfig(filepath.Join(home, ".ssh", "config"), home, 0)
	if err != nil {
		return nil, err
	}
	hosts = dedupeSSHHosts(hosts)
	sort.Slice(hosts, func(i, j int) bool { return hosts[i].Name < hosts[j].Name })
	if hosts == nil {
		hosts = []SSHConfigHost{}
	}
	return hosts, nil
}

const sshIncludeMaxDepth = 4

func parseSSHConfig(path, home string, depth int) ([]SSHConfigHost, error) {
	if depth > sshIncludeMaxDepth {
		return nil, nil
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	var (
		hosts   []SSHConfigHost
		blocks  []*sshConfigBlock
		current *sshConfigBlock
		// We can't evaluate `Match` predicates without faking ssh's
		// connection state, so any block under `Match` is ignored until the
		// next `Host`.
		skipMatch bool
	)

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		key, val, ok := parseSSHConfigLine(scanner.Text())
		if !ok {
			continue
		}
		switch strings.ToLower(key) {
		case "host":
			skipMatch = false
			names := []string{}
			for _, n := range splitSSHFields(val) {
				if !isSSHWildcardHost(n) {
					names = append(names, n)
				}
			}
			if len(names) == 0 {
				current = nil
				continue
			}
			current = &sshConfigBlock{names: names}
			blocks = append(blocks, current)
		case "match":
			skipMatch = true
			current = nil
		case "include":
			for _, pat := range splitSSHFields(val) {
				matches, _ := filepath.Glob(expandSSHIncludePath(pat, home))
				for _, m := range matches {
					sub, err := parseSSHConfig(m, home, depth+1)
					if err == nil {
						hosts = append(hosts, sub...)
					}
				}
			}
		default:
			if skipMatch || current == nil {
				continue
			}
			switch strings.ToLower(key) {
			case "user":
				if current.user == "" {
					current.user = strings.TrimSpace(val)
				}
			case "port":
				if current.port == 0 {
					if n, err := strconv.Atoi(firstSSHField(val)); err == nil && n > 0 {
						current.port = n
					}
				}
			case "identityfile":
				if current.identityFile == "" {
					current.identityFile = firstSSHField(val)
				}
			case "hostname":
				if current.hostName == "" {
					current.hostName = firstSSHField(val)
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	for _, b := range blocks {
		for _, name := range b.names {
			hosts = append(hosts, SSHConfigHost{
				Name:         name,
				HostName:     b.hostName,
				User:         b.user,
				Port:         b.port,
				IdentityFile: b.identityFile,
			})
		}
	}
	return hosts, nil
}

type sshConfigBlock struct {
	names        []string
	hostName     string
	user         string
	port         int
	identityFile string
}

// parseSSHConfigLine returns the keyword and value for a config line,
// stripping comments and the optional `=` separator. Returns ok=false for
// blanks and comment-only lines.
func parseSSHConfigLine(line string) (key, val string, ok bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", false
	}
	idx := strings.IndexAny(line, " \t=")
	if idx < 0 {
		return "", "", false
	}
	key = line[:idx]
	rest := strings.TrimSpace(line[idx:])
	rest = strings.TrimPrefix(rest, "=")
	return key, strings.TrimSpace(rest), true
}

// splitSSHFields tokenises a value, honouring double-quoted spans so paths
// or hostnames containing spaces survive intact.
func splitSSHFields(s string) []string {
	var out []string
	var cur strings.Builder
	inQuotes := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"':
			inQuotes = !inQuotes
		case (c == ' ' || c == '\t') && !inQuotes:
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteByte(c)
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}

func firstSSHField(s string) string {
	parts := splitSSHFields(s)
	if len(parts) == 0 {
		return ""
	}
	return parts[0]
}

func isSSHWildcardHost(name string) bool {
	if name == "" {
		return true
	}
	if strings.HasPrefix(name, "!") {
		return true
	}
	return strings.ContainsAny(name, "*?")
}

func expandSSHIncludePath(pat, home string) string {
	if filepath.IsAbs(pat) {
		return pat
	}
	if strings.HasPrefix(pat, "~/") {
		return filepath.Join(home, pat[2:])
	}
	return filepath.Join(home, ".ssh", pat)
}

// dedupeSSHHosts keeps the first occurrence of each name (matches ssh's
// first-match-wins precedence for repeated Host blocks).
func dedupeSSHHosts(in []SSHConfigHost) []SSHConfigHost {
	seen := make(map[string]struct{}, len(in))
	out := make([]SSHConfigHost, 0, len(in))
	for _, h := range in {
		if _, dup := seen[h.Name]; dup {
			continue
		}
		seen[h.Name] = struct{}{}
		out = append(out, h)
	}
	return out
}
