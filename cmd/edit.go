package cmd

import (
	"os"
	"os/exec"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"github.com/spf13/cobra"
)

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

var editCmd = &cobra.Command{
	Use:   "edit <project>",
	Short: "Open a project config in your editor",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]
		if err := config.ValidateName(name); err != nil {
			fatal(err)
		}
		path := config.ProjectPath(name)

		if _, err := os.Stat(path); os.IsNotExist(err) {
			fatalf("project %q not found", name)
		}

		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "vi"
		}

		c := exec.Command("sh", "-c", editor+" "+shellQuote(path))
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr

		if err := c.Run(); err != nil {
			fatalf("failed to open editor: %v", err)
		}
	},
}

func init() {
	editCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(editCmd)
}
