package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gug007/lpm/internal/config"
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
			if c.Latest != "" && versionNewer(c.Latest, version) {
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

	if versionNewer(latest, version) {
		return updateNotice(latest)
	}
	return ""
}

func versionNewer(latest, current string) bool {
	parse := func(v string) [3]int {
		var parts [3]int
		for i, s := range strings.SplitN(v, ".", 3) {
			parts[i], _ = strconv.Atoi(s)
		}
		return parts
	}
	l, c := parse(latest), parse(current)
	if l[0] != c[0] {
		return l[0] > c[0]
	}
	if l[1] != c[1] {
		return l[1] > c[1]
	}
	return l[2] > c[2]
}

func updateNotice(latest string) string {
	return fmt.Sprintf("\n%sUpdate available: v%s → v%s%s\n  curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash\n",
		colorDim, version, latest, colorReset)
}
