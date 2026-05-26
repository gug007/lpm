package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
)

// UploadAndQuoteForTerminal uploads to remote panes; non-remote panes get
// local-path formatting. Single images stay unquoted so path-detecting
// receivers can stat them; everything else is shell-quoted.
func (a *App) UploadAndQuoteForTerminal(terminalID string, localPaths []string) (string, error) {
	if len(localPaths) == 0 {
		return "", nil
	}

	a.ptyMu.Lock()
	sess, ok := a.ptySessions[terminalID]
	a.ptyMu.Unlock()

	if !ok || !sess.remote || sess.ssh == nil {
		return formatPastePaths(localPaths), nil
	}

	remotePaths, err := a.uploadFiles(sess.ssh, localPaths)
	if err != nil {
		return "", err
	}
	return formatPastePaths(remotePaths), nil
}

func (a *App) UploadClipboardImageForTerminal(terminalID, b64Data, mimeType string) (string, error) {
	localPath, err := a.SaveClipboardImage(b64Data, mimeType)
	if err != nil {
		return "", err
	}
	return a.UploadAndQuoteForTerminal(terminalID, []string{localPath})
}

func (a *App) uploadFiles(s *config.SSHSettings, localPaths []string) ([]string, error) {
	batch, err := newBatchID()
	if err != nil {
		return nil, fmt.Errorf("upload: %w", err)
	}
	_ = config.EnsureSSHControlDir()

	// Resolve via $HOME on the remote to avoid the ~-expansion-vs-quoting
	// trap when we paste paths with special characters in basenames.
	remoteCmd := fmt.Sprintf(`mkdir -p "$HOME/.lpm/uploads/%s" && printf '%%s' "$HOME/.lpm/uploads/%s"`, batch, batch)
	mkdirArgs := append([]string{}, config.SSHArgs(s)...)
	mkdirArgs = append(mkdirArgs, remoteCmd)

	mkdirCmd := exec.Command("ssh", mkdirArgs...)
	var mkdirErr bytes.Buffer
	mkdirCmd.Stderr = &mkdirErr
	out, err := mkdirCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ssh mkdir: %s: %w", trimOutput(mkdirErr.String()), err)
	}
	remoteDir := strings.TrimSpace(string(out))
	if remoteDir == "" {
		return nil, fmt.Errorf("ssh mkdir returned empty path")
	}

	scpArgs := append([]string{}, config.SCPArgs(s)...)
	scpArgs = append(scpArgs, "-r", "-p", "--")
	scpArgs = append(scpArgs, localPaths...)
	scpArgs = append(scpArgs, fmt.Sprintf("%s@%s:%s/", s.User, s.Host, remoteDir))

	scpCmd := exec.Command("scp", scpArgs...)
	var scpErr bytes.Buffer
	scpCmd.Stderr = &scpErr
	if _, err := scpCmd.Output(); err != nil {
		return nil, fmt.Errorf("scp: %s: %w", trimOutput(scpErr.String()), err)
	}

	remotePaths := make([]string, len(localPaths))
	for i, p := range localPaths {
		remotePaths[i] = remoteDir + "/" + filepath.Base(p)
	}
	return remotePaths, nil
}

func newBatchID() (string, error) {
	var rb [3]byte
	if _, err := rand.Read(rb[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("%d-%s", time.Now().Unix(), hex.EncodeToString(rb[:])), nil
}

// imageExtRe mirrors IMAGE_EXT_RE in InteractivePane.tsx — keep in sync.
var imageExtRe = regexp.MustCompile(`(?i)\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$`)

// formatPastePaths mirrors formatPastedPaths in InteractivePane.tsx.
func formatPastePaths(paths []string) string {
	if len(paths) == 1 && imageExtRe.MatchString(paths[0]) {
		return paths[0]
	}
	parts := make([]string, len(paths))
	for i, p := range paths {
		parts[i] = shellQuoteSingle(p)
	}
	return strings.Join(parts, " ")
}

// safePathChars mirrors the predicate in shellQuote (terminal-io.ts).
var safePathChars = regexp.MustCompile(`^[A-Za-z0-9_./:~-]+$`)

func shellQuoteSingle(s string) string {
	if s == "" {
		return "''"
	}
	if safePathChars.MatchString(s) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func trimOutput(s string) string {
	s = strings.TrimSpace(s)
	const max = 400
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}
