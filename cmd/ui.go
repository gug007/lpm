package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
)

var (
	colorGreen = "\033[32m"
	colorCyan  = "\033[36m"
	colorBold  = "\033[1m"
	colorDim   = "\033[2m"
	colorReset = "\033[0m"
)

func init() {
	if fi, _ := os.Stdout.Stat(); fi != nil && (fi.Mode()&os.ModeCharDevice) == 0 {
		colorGreen, colorCyan, colorBold, colorDim, colorReset = "", "", "", "", ""
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func pluralize(n int, singular string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", singular)
	}
	return fmt.Sprintf("%d %ss", n, singular)
}

func collectPorts(services map[string]config.Service) []string {
	var ports []string
	for _, svc := range services {
		if svc.Port > 0 {
			ports = append(ports, fmt.Sprintf(":%d", svc.Port))
		}
	}
	return ports
}

func statusIndicator(running bool) string {
	if running {
		return fmt.Sprintf("%s●%s", colorGreen, colorReset)
	}
	return fmt.Sprintf("%s○%s", colorDim, colorReset)
}

func printServiceTable(serviceNames []string, services map[string]config.Service) {
	for _, svcName := range serviceNames {
		svc := services[svcName]
		portInfo := ""
		if svc.Port > 0 {
			portInfo = fmt.Sprintf("  %s→ localhost:%d%s", colorCyan, svc.Port, colorReset)
		}
		fmt.Printf("  %-12s %s%s\n", svcName, svc.Cmd, portInfo)
	}
}

func killProjectSession(name string) error {
	return tmux.KillSession(config.SessionName(name))
}

func killAllExcept(exclude string) {
	projects, err := config.ListProjects()
	if err != nil {
		fatal(err)
	}
	stopped := 0
	for _, name := range projects {
		if name != exclude {
			if err := killProjectSession(name); err == nil {
				fmt.Printf("Stopped %s\n", name)
				stopped++
			}
		}
	}
	if stopped == 0 && exclude == "" {
		fmt.Println("No running projects")
	}
}

func runProject(name, profile string, attach bool) {
	if err := tmux.EnsureInstalled(); err != nil {
		fatal(err)
	}
	cfg, err := config.LoadProject(name)
	if err != nil {
		fatal(err)
	}
	if err := tmux.StartProject(cfg, profile); err != nil {
		fatal(err)
	}
	if attach {
		fmt.Printf("Started %s\n", name)
		if err := tmux.Attach(cfg.Name); err != nil {
			fatal(err)
		}
	} else {
		printStarted(name, cfg, profile)
	}
}

func printStarted(name string, cfg *config.ProjectConfig, profile string) {
	serviceNames := cfg.ServicesForProfile(profile)
	fmt.Printf("\n%sStarted %s%s\n\n", colorGreen, name, colorReset)
	printServiceTable(serviceNames, cfg.Services)
	fmt.Printf("\n  %slpm start %s%s   open terminal\n", colorDim, name, colorReset)
	fmt.Printf("  %slpm kill %s%s    stop\n\n", colorDim, name, colorReset)
}
