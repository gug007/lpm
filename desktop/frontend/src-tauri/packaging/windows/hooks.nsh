; The agent hooks lpm writes on Windows run the CLI beside the app by absolute
; path, so a removal that left them would make every Claude Code and Codex
; event fail. Upgrades run this uninstaller too, so it removes only those hook
; entries; services, the CLI copy and skills stay, and the next lpm start writes
; the hooks again. Settings > Remove app takes out the rest.
!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-agent-hooks'
!macroend
