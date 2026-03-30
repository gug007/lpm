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
			fmt.Printf("%s%s%s: %s● running%s\n", colorBold, name, colorReset, colorGreen, colorReset)
		} else {
			fmt.Printf("%s%s%s: %s○ stopped%s\n", colorBold, name, colorReset, colorDim, colorReset)
		}

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
