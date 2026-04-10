package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gug007/lpm/internal/version"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type progressWriter struct {
	dst     io.Writer
	total   int64
	written int64
	lastPct int
	emit    func(pct int)
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n, err := pw.dst.Write(p)
	pw.written += int64(n)
	if pw.total > 0 {
		pct := int(pw.written * 100 / pw.total)
		if pct != pw.lastPct {
			pw.lastPct = pct
			pw.emit(pct)
		}
	}
	return n, err
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

var Version = "dev"

type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	UpdateAvail    bool   `json:"updateAvail"`
}

func (a *App) GetVersion() string {
	return Version
}

func (a *App) GetPlatform() string {
	return goruntime.GOOS + "/" + goruntime.GOARCH
}

func (a *App) autoCheckForUpdate() {
	if Version == "dev" {
		return
	}

	a.checkForUpdateAndEmit()

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.checkForUpdateAndEmit()
		}
	}
}

func (a *App) checkForUpdateAndEmit() {
	info, err := a.CheckForUpdate()
	if err != nil {
		return
	}
	if info.UpdateAvail {
		runtime.EventsEmit(a.ctx, "update-available", info)
	}
}

func (a *App) CheckForUpdate() (*UpdateInfo, error) {
	resp, err := httpClient.Get("https://api.github.com/repos/gug007/lpm/releases/latest")
	if err != nil {
		return nil, fmt.Errorf("failed to check for updates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	current := strings.TrimPrefix(Version, "v")

	// Find the DMG asset matching current architecture
	suffix := fmt.Sprintf("macos-%s.dmg", goruntime.GOARCH)
	a.pendingDownloadURL = ""
	for _, asset := range release.Assets {
		if strings.HasSuffix(asset.Name, suffix) {
			a.pendingDownloadURL = asset.BrowserDownloadURL
			break
		}
	}

	return &UpdateInfo{
		CurrentVersion: current,
		LatestVersion:  latest,
		UpdateAvail:    version.Newer(latest, current),
	}, nil
}

func appBundlePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	// Walk up from e.g. /Applications/lpm.app/Contents/MacOS/lpm-desktop
	for dir := filepath.Dir(exe); dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if strings.HasSuffix(dir, ".app") {
			return dir, nil
		}
	}
	return "", fmt.Errorf("could not determine .app bundle path from %s", exe)
}

func (a *App) InstallUpdate() error {
	if a.pendingDownloadURL == "" {
		return fmt.Errorf("no update available — check for updates first")
	}

	emitProgress := func(pct int) {
		runtime.EventsEmit(a.ctx, "update-progress", pct)
	}
	emitStatus := func(status string) {
		runtime.EventsEmit(a.ctx, "update-status", status)
	}

	appPath, err := appBundlePath()
	if err != nil {
		return err
	}
	appDir := filepath.Dir(appPath)

	// Download DMG to temp file
	emitStatus("downloading")
	tmpFile, err := os.CreateTemp("", "lpm-update-*.dmg")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	dmgPath := tmpFile.Name()
	defer os.Remove(dmgPath)
	defer tmpFile.Close()

	dlClient := &http.Client{Timeout: 5 * time.Minute}
	resp, err := dlClient.Get(a.pendingDownloadURL)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	pw := &progressWriter{
		dst:   tmpFile,
		total: resp.ContentLength,
		emit:  emitProgress,
	}
	if _, err := io.Copy(pw, resp.Body); err != nil {
		return fmt.Errorf("failed to save update: %w", err)
	}
	tmpFile.Close()

	// Mount DMG to a known temp path
	emitStatus("installing")
	mountPoint, err := os.MkdirTemp("", "lpm-mount-*")
	if err != nil {
		return fmt.Errorf("failed to create mount dir: %w", err)
	}
	defer os.Remove(mountPoint)

	cmdTimeout := 60 * time.Second

	ctx, cancel := context.WithTimeout(context.Background(), cmdTimeout)
	defer cancel()
	if out, err := exec.CommandContext(ctx, "hdiutil", "attach", dmgPath, "-nobrowse", "-mountpoint", mountPoint).CombinedOutput(); err != nil {
		return fmt.Errorf("failed to mount DMG: %s", string(out))
	}
	defer exec.Command("hdiutil", "detach", mountPoint, "-quiet").Run()

	// Find .app inside mounted volume
	entries, err := os.ReadDir(mountPoint)
	if err != nil {
		return fmt.Errorf("failed to read mounted DMG: %w", err)
	}
	var newAppName string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".app") {
			newAppName = e.Name()
			break
		}
	}
	if newAppName == "" {
		return fmt.Errorf("no .app found in DMG")
	}

	srcApp := filepath.Join(mountPoint, newAppName)
	dstApp := filepath.Join(appDir, newAppName)

	// Copy new app to a staging path, then atomically swap
	stagingApp := dstApp + ".new"
	os.RemoveAll(stagingApp)

	ctx2, cancel2 := context.WithTimeout(context.Background(), cmdTimeout)
	defer cancel2()
	if out, err := exec.CommandContext(ctx2, "ditto", srcApp, stagingApp).CombinedOutput(); err != nil {
		os.RemoveAll(stagingApp)
		return fmt.Errorf("failed to copy new app: %s", string(out))
	}
	if err := os.RemoveAll(dstApp); err != nil {
		os.RemoveAll(stagingApp)
		return fmt.Errorf("failed to remove old app: %w", err)
	}
	if err := os.Rename(stagingApp, dstApp); err != nil {
		return fmt.Errorf("failed to finalize update: %w", err)
	}

	// Cleanup explicitly before exit (defers won't run after os.Exit)
	exec.Command("hdiutil", "detach", mountPoint, "-quiet").Run()
	os.Remove(dmgPath)
	os.Remove(mountPoint)

	// Spawn a detached process that waits for this process to exit,
	// then launches the updated app. This avoids two simultaneous
	// instances fighting over the same Wails port / dock icon.
	script := fmt.Sprintf(
		`while kill -0 %d 2>/dev/null; do sleep 0.2; done; sleep 0.5; open %q`,
		os.Getpid(), dstApp,
	)
	relaunch := exec.Command("bash", "-c", script)
	relaunch.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := relaunch.Start(); err != nil {
		return fmt.Errorf("failed to schedule relaunch: %w", err)
	}
	a.shutdown(a.ctx)
	// Terminate through Cocoa so the dock icon is properly released.
	forceTerminate()
	// Fallback if the main run-loop can't process the terminate in time.
	time.Sleep(3 * time.Second)
	os.Exit(0)
	return nil // unreachable; satisfies compiler
}
