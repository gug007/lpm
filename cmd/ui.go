package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
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

func printStarted(name string, cfg *config.ProjectConfig, profile string) {
	serviceNames := cfg.ServicesForProfile(profile)
	fmt.Printf("\n%sStarted %s%s\n\n", colorGreen, name, colorReset)
	printServiceTable(serviceNames, cfg.Services)
	fmt.Printf("\n  %slpm start %s%s   open terminal\n", colorDim, name, colorReset)
	fmt.Printf("  %slpm kill %s%s    stop\n\n", colorDim, name, colorReset)
}
