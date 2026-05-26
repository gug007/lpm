package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"github.com/spf13/cobra"
)

var (
	cloneBranch string
	cloneName   string
	cloneDest   string
)

var cloneCmd = &cobra.Command{
	Use:   "clone <url>",
	Short: "Clone a Git repository and register it as a project",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		url := strings.TrimSpace(args[0])
		if url == "" {
			fatalf("repository URL is required")
		}

		name := cloneName
		if name == "" {
			name = repoNameFromURL(url)
		}
		if err := config.ValidateName(name); err != nil {
			fatal(err)
		}
		if config.ProjectExists(name) {
			fatalf("project %q already exists. Edit with: lpm edit %s", name, name)
		}

		destParent := cloneDest
		if destParent == "" {
			cwd, err := os.Getwd()
			if err != nil {
				fatal(err)
			}
			destParent = cwd
		}
		destParent = config.ExpandHome(destParent)
		info, err := os.Stat(destParent)
		if err != nil {
			fatalf("destination %q does not exist", destParent)
		}
		if !info.IsDir() {
			fatalf("destination %q is not a directory", destParent)
		}

		destDir := filepath.Join(destParent, name)
		if _, err := os.Stat(destDir); err == nil {
			fatalf("destination %q already exists", destDir)
		}

		fmt.Printf("Cloning %s into %s...\n", url, destDir)
		gitArgs := []string{"clone"}
		if cloneBranch != "" {
			gitArgs = append(gitArgs, "--branch", cloneBranch, "--single-branch")
		}
		gitArgs = append(gitArgs, url, destDir)

		gitCmd := exec.Command("git", gitArgs...)
		gitCmd.Stdout = os.Stdout
		gitCmd.Stderr = os.Stderr
		if err := gitCmd.Run(); err != nil {
			os.RemoveAll(destDir)
			fatalf("git clone failed: %v", err)
		}

		cfg := &config.ProjectConfig{
			Name:     name,
			Root:     destDir,
			Services: detectServices(destDir),
		}
		if len(cfg.Services) == 0 {
			cfg.Services = map[string]config.Service{
				"app": {Cmd: "echo 'edit ~/.lpm/projects/" + name + ".yml to configure'"},
			}
		}

		if err := config.SaveProject(cfg); err != nil {
			os.RemoveAll(destDir)
			fatal(err)
		}

		fmt.Printf("\nCreated %s\n", config.ProjectPath(name))
		if len(cfg.Services) > 0 {
			fmt.Println("Detected services:")
			for svcName, svc := range cfg.Services {
				fmt.Printf("  %-15s %s\n", svcName, svc.Cmd)
			}
		}
		fmt.Printf("Start with: lpm %s\n", name)
	},
}

// repoNameFromURL extracts a project name from a Git URL.
// Examples:
//
//	https://github.com/foo/bar.git -> bar
//	git@github.com:foo/bar.git     -> bar
//	ssh://git@host:22/foo/bar      -> bar
func repoNameFromURL(url string) string {
	s := strings.TrimSpace(url)
	if i := strings.LastIndex(s, "#"); i >= 0 {
		s = s[:i]
	}
	if i := strings.LastIndex(s, "?"); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimRight(s, "/")
	s = strings.TrimSuffix(s, ".git")
	if i := strings.LastIndexAny(s, "/:"); i >= 0 {
		s = s[i+1:]
	}
	re := regexp.MustCompile(`[^A-Za-z0-9._-]+`)
	s = re.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-.")
	return s
}

func init() {
	cloneCmd.Flags().StringVarP(&cloneBranch, "branch", "b", "", "branch to check out (default: repo default)")
	cloneCmd.Flags().StringVar(&cloneName, "name", "", "project name (default: derived from URL)")
	cloneCmd.Flags().StringVar(&cloneDest, "dest", "", "parent directory for the clone (default: current directory)")
	rootCmd.AddCommand(cloneCmd)
}
