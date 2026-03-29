package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var version = "0.1.0"

var rootProfileFlag string

var rootCmd = &cobra.Command{
	Use:   "lpm [project]",
	Short: "Local Project Manager — manage and switch between dev projects",
	Long:  "LPM manages local development projects using tmux sessions.\nConfigure your projects once, then start/stop them with a single command.\n\nUsage: lpm <project> to start a project in the background.",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			return
		}

		if err := tmux.EnsureInstalled(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		name := args[0]
		cfg, err := config.LoadProject(name)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		if err := tmux.StartProject(cfg, rootProfileFlag); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		serviceNames := cfg.ServicesForProfile(rootProfileFlag)
		fmt.Printf("%s%s%s: %s● running%s\n", colorBold, name, colorReset, colorGreen, colorReset)
		for _, svcName := range serviceNames {
			svc := cfg.Services[svcName]
			portInfo := ""
			if svc.Port > 0 {
				portInfo = fmt.Sprintf(" %s:%d%s", colorCyan, svc.Port, colorReset)
			}
			fmt.Printf("  %-15s %s%s\n", svcName, svc.Cmd, portInfo)
		}
	},
}

func init() {
	rootCmd.Flags().StringVarP(&rootProfileFlag, "profile", "p", "", "profile to use (default: all services)")
	rootCmd.ValidArgsFunction = completeProjectNames
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
