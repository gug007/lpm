package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
)

// UploadAndQuoteForTerminal uploads localPaths to the remote host of the
// terminal's project (when the terminal was started in remote mode) and
// returns a single string of paths formatted for paste — single images
// unquoted (so path-detecting receivers like Claude Code can stat them),
// everything else shell-quoted and space-joined. For non-remote panes
// the same formatting is applied to the local paths, so the frontend
// can call this unconditionally.
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

// UploadClipboardImageForTerminal saves the base64-encoded clipboard
// image to a local temp file and routes through the same upload path,
// so remote panes get a remote path and local panes get the local temp.
func (a *App) UploadClipboardImageForTerminal(terminalID, b64Data, mimeType string) (string, error) {
	localPath, err := saveClipboardImageTemp(b64Data, mimeType)
	if err != nil {
		return "", err
	}
	return a.UploadAndQuoteForTerminal(terminalID, []string{localPath})
}

// uploadFiles scp's localPaths to a fresh per-batch directory on the
// SSH host, reusing the existing ControlMaster socket. Returns the
// absolute remote paths in the same order as localPaths.
func (a *App) uploadFiles(s *config.SSHSettings, localPaths []string) ([]string, error) {
	batch, err := newBatchID()
	if err != nil {
		return nil, fmt.Errorf("upload: %w", err)
	}
	_ = config.EnsureSSHControlDir()

	// One ssh round-trip: create the dir and echo its absolute path.
	// Resolving via $HOME on the remote avoids the ~-expansion-vs-quoting
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

	// scp all files in one call. Putting -- before the source paths is
	// belt-and-suspenders; local paths from drag/drop or the temp dir
	// always start with /, so they can't be mistaken for flags anyway.
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

// formatPastePaths mirrors formatPastedPaths in InteractivePane.tsx:
// a single image path is pasted unquoted so path-detecting receivers
// (e.g. Claude Code) can stat it; everything else is shell-quoted and
// space-joined for shell users.
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

// safePathChars mirrors the predicate in shellQuote (terminal-io.ts:15):
// any path containing characters outside this set gets single-quoted.
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

// saveClipboardImageTemp is the file-write half of SaveClipboardImage,
// reused so UploadClipboardImageForTerminal doesn't need a frontend
// round-trip just to get a temp path.
func saveClipboardImageTemp(b64Data, mimeType string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64Data)
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}
	ext := ".png"
	switch mimeType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/bmp":
		ext = ".bmp"
	}
	f, err := os.CreateTemp("", "clipboard-*"+ext)
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("write temp file: %w", err)
	}
	return f.Name(), nil
}

func trimOutput(s string) string {
	s = strings.TrimSpace(s)
	const max = 400
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}
