package cmd

import (
	"fmt"

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
			fatal(err)
		}

		running := tmux.SessionExists(cfg.Name)
		fmt.Printf("%s%s%s: %s\n", colorBold, name, colorReset, statusIndicator(running))

		fmt.Println("\nServices:")
		serviceNames := cfg.ServicesForProfile("")
		printServiceTable(serviceNames, cfg.Services)

		if len(cfg.Profiles) > 0 {
			fmt.Println("\nProfiles:")
			for pName, services := range cfg.Profiles {
				fmt.Printf("  %-15s %v\n", pName, services)
			}
		}
	},
}

func init() {
	statusCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(statusCmd)
}
