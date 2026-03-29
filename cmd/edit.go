package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"github.com/spf13/cobra"
)

func shellescape(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

var editCmd = &cobra.Command{
	Use:   "edit <project>",
	Short: "Open a project config in your editor",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]
		if err := config.ValidateName(name); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		path := filepath.Join(config.ProjectsDir(), name+".yml")

		if _, err := os.Stat(path); os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "project %q not found\n", name)
			os.Exit(1)
		}

		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "vi"
		}

		c := exec.Command("sh", "-c", editor+" "+shellescape(path))
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr

		if err := c.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "failed to open editor: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(editCmd)
}
