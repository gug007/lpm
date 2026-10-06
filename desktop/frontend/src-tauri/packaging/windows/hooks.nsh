; An installer replacing lpm runs the old uninstaller in place, with `_?=`;
; every other uninstall (Settings > Apps, a script) runs a temporary copy of
; it. That tells an upgrade, which keeps the services, the CLI, the skills and
; the shortcuts and pins, from a removal, which ends and removes all of them.
; Either way the agent hooks go: they run the CLI beside the app by absolute
; path, and the next lpm start writes them again.
!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  ${If} $UpdateMode = 1
  ${OrIf} $EXEDIR == $INSTDIR
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-agent-hooks'
    ${IfThen} $DeleteAppDataCheckboxState <> 1 ${|} StrCpy $UpdateMode 1 ${|}
  ${Else}
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall'
  ${EndIf}
!macroend

; Tauri's own check matches every process with the app's file name, so it
; offered to kill a dev build or any other copy too. This one matches only the
; exe in $INSTDIR.
Var LpmAppExe
Var LpmAppKill
Var LpmAppCount

!macro LPM_APP_PROCESSES_FUNCTION UN
Function ${UN}LpmAppProcesses
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  StrCpy $LpmAppCount 0
  System::Alloc 16384
  Pop $0
  System::Call 'kernel32::K32EnumProcesses(p r0, i 16384, *i 0 r1) i .r2'
  ${If} $2 <> 0
    StrCpy $2 0
    ${DoWhile} $2 < $1
      IntPtrOp $3 $0 + $2
      System::Call '*$3(i .r4)'
      System::Call 'kernel32::OpenProcess(i 0x1000, i 0, i r4) p .r5'
      ${If} $5 P<> 0
        System::Call 'kernel32::QueryFullProcessImageNameW(p r5, i 0, w .r7, *i ${NSIS_MAX_STRLEN}) i .r6'
        ${If} $6 <> 0
          System::Call 'kernel32::GetExitCodeProcess(p r5, *i 0 r6)'
        ${EndIf}
        System::Call 'kernel32::CloseHandle(p r5)'
        ${If} $6 = 259
        ${AndIf} $7 == $LpmAppExe
          IntOp $LpmAppCount $LpmAppCount + 1
          ${If} $LpmAppKill = 1
            System::Call 'kernel32::OpenProcess(i 0x100001, i 0, i r4) p .r5'
            ${If} $5 P<> 0
              System::Call 'kernel32::TerminateProcess(p r5, i 1)'
              System::Call 'kernel32::WaitForSingleObject(p r5, i 5000)'
              System::Call 'kernel32::CloseHandle(p r5)'
            ${EndIf}
          ${EndIf}
        ${EndIf}
      ${EndIf}
      IntOp $2 $2 + 4
    ${Loop}
  ${EndIf}
  System::Free $0
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!macroend
!insertmacro LPM_APP_PROCESSES_FUNCTION ""
!insertmacro LPM_APP_PROCESSES_FUNCTION "un."

!macro LPM_APP_PROCESSES kill
  StrCpy $LpmAppKill ${kill}
  !ifdef __UNINSTALL__
    Call un.LpmAppProcesses
  !else
    Call LpmAppProcesses
  !endif
!macroend

!macroundef CheckIfAppIsRunning
!macro CheckIfAppIsRunning executableName productName
  nsis_tauri_utils::StrReplace "$(appRunning)" "{{product_name}}" "${productName}"
  Pop $R1
  nsis_tauri_utils::StrReplace "$(appRunningOkKill)" "{{product_name}}" "${productName}"
  Pop $R2
  nsis_tauri_utils::StrReplace "$(failedToKillApp)" "{{product_name}}" "${productName}"
  Pop $R3
  StrCpy $LpmAppExe "$INSTDIR\${executableName}"
  !insertmacro LPM_APP_PROCESSES 0
  ${If} $LpmAppCount > 0
    ${IfNot} ${Silent}
    ${AndIf} $PassiveMode <> 1
    ${AndIf} ${Cmd} `MessageBox MB_OKCANCEL $R2 IDCANCEL`
      Abort $R1
    ${EndIf}
    !insertmacro LPM_APP_PROCESSES 1
    Sleep 500
    !insertmacro LPM_APP_PROCESSES 0
    ${If} $LpmAppCount > 0
      ${If} ${Silent}
        System::Call 'kernel32::AttachConsole(i -1)i.r0'
        ${If} $0 != 0
          System::Call 'kernel32::GetStdHandle(i -11)i.r0'
          System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)'
          FileWrite $0 "$R1$\n"
        ${EndIf}
        Abort
      ${EndIf}
      Abort $R3
    ${EndIf}
  ${EndIf}
!macroend
