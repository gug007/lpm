package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
	semver "github.com/gug007/lpm/internal/version"
)

type updateCache struct {
	Date   string `json:"date"`
	Latest string `json:"latest"`
}

var (
	updateDone   = make(chan string, 1)
	updateClient = &http.Client{Timeout: 3 * time.Second}
)

func updateCachePath() string {
	return filepath.Join(config.LpmDir(), ".update-check")
}

func checkForUpdateInBackground() {
	if version == "dev" {
		updateDone <- ""
		return
	}

	go func() {
		updateDone <- checkUpdate()
	}()
}

func printUpdateNotice() {
	select {
	case msg := <-updateDone:
		if msg != "" {
			fmt.Fprint(os.Stderr, msg)
		}
	case <-time.After(2 * time.Second):
		// Don't delay exit if network is slow
	}
}

func checkUpdate() string {
	path := updateCachePath()
	today := time.Now().Format("2006-01-02")

	if data, err := os.ReadFile(path); err == nil {
		var c updateCache
		if json.Unmarshal(data, &c) == nil && c.Date == today {
			if c.Latest != "" && semver.Newer(c.Latest, version) {
				return updateNotice(c.Latest)
			}
			return ""
		}
	}

	resp, err := updateClient.Get("https://api.github.com/repos/gug007/lpm/releases/latest")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return ""
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return ""
	}

	latest := strings.TrimPrefix(release.TagName, "v")

	c := updateCache{Date: today, Latest: latest}
	if data, err := json.Marshal(c); err == nil {
		os.WriteFile(path, data, 0644)
	}

	if semver.Newer(latest, version) {
		return updateNotice(latest)
	}
	return ""
}


func updateNotice(latest string) string {
	return fmt.Sprintf("\n%sUpdate available: v%s → v%s%s\n  curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash\n",
		colorDim, version, latest, colorReset)
}
