package cmd

import (
	"github.com/gug007/lpm/internal/config"
	"github.com/spf13/cobra"
)

// completeProjectNames provides dynamic shell completion for project names.
// It reads ~/.lpm/projects/*.yml and returns the base names (without extension).
func completeProjectNames(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	// Only complete the first positional arg (the project name).
	if len(args) > 0 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	names, err := config.ListProjects()
	if err != nil {
		return nil, cobra.ShellCompDirectiveError
	}
	return names, cobra.ShellCompDirectiveNoFileComp
}
