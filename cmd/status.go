package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status <project>",
	Short: "Show status of a project",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		cfg, err := config.LoadProject(name)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		running := tmux.SessionExists(cfg.Name)
		if running {
			fmt.Printf("%s: running\n", name)
		} else {
			fmt.Printf("%s: stopped\n", name)
		}

		fmt.Println("\nServices:")
		for svcName, svc := range cfg.Services {
			portInfo := ""
			if svc.Port > 0 {
				portInfo = fmt.Sprintf(" (port %d)", svc.Port)
			}
			fmt.Printf("  %-15s %s%s\n", svcName, svc.Cmd, portInfo)
		}

		if len(cfg.Profiles) > 0 {
			fmt.Println("\nProfiles:")
			for pName, services := range cfg.Profiles {
				fmt.Printf("  %-15s %v\n", pName, services)
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
}
