package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var listCmd = &cobra.Command{
	Use:     "list",
	Short:   "List all configured projects",
	Aliases: []string{"ls"},
	Run: func(cmd *cobra.Command, args []string) {
		projects, err := config.ListProjects()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		if len(projects) == 0 {
			fmt.Println("No projects configured. Use 'lpm init' to add one.")
			return
		}

		sessions := tmux.ListSessions()
		runCount := 0
		fmt.Println()
		for _, name := range projects {
			cfg, err := config.LoadProject(name)
			if err != nil {
				fmt.Fprintf(os.Stderr, "  %s! %-18s config error%s\n", colorDim, name, colorReset)
				continue
			}

			svcLabel := pluralize(len(cfg.Services), "service")
			running := sessions[cfg.Name]

			if running {
				runCount++
				ports := collectPorts(cfg.Services)
				portInfo := ""
				if len(ports) > 0 {
					portInfo = fmt.Sprintf("  %s%s%s", colorCyan, strings.Join(ports, " "), colorReset)
				}
				fmt.Printf("  %s %-18s %-12s%s\n", statusIndicator(true), name, svcLabel, portInfo)
			} else {
				fmt.Printf("  %s %s%-18s %-12s%s\n", statusIndicator(false), colorDim, name, svcLabel, colorReset)
			}
		}
		fmt.Printf("\n  %d running, %d stopped\n\n", runCount, len(projects)-runCount)
	},
}

func init() {
	rootCmd.AddCommand(listCmd)
}
