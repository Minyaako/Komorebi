!macro customInstall
  CreateDirectory "$SMPROGRAMS\木漏日 Komorebi"
  CreateShortCut "$SMPROGRAMS\木漏日 Komorebi\卸载木漏日.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend
!macro customUnInstall
  Delete "$SMPROGRAMS\木漏日 Komorebi\卸载木漏日.lnk"
!macroend
; Check only this installation, without terminating another portable copy.
!macro customCheckAppRunning
  System::Call 'kernel32::SetEnvironmentVariableW(w "KOMOREBI_INSTALL_CHECK", w "$INSTDIR\${APP_EXECUTABLE_FILENAME}") i .r0'
  nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -Command "try { if (Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -eq $$env:KOMOREBI_INSTALL_CHECK }) { exit 0 }; exit 1 } catch { exit 2 }"`
  Pop $R0
  ${if} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "此安装目录中的木漏日仍在运行。请从系统托盘退出，再重新运行安装或卸载。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${elseif} $R0 != 1
    MessageBox MB_OK|MB_ICONEXCLAMATION "无法检查木漏日是否已经退出，请稍后重试。" /SD IDOK
    SetErrorLevel 3
    Quit
  ${endIf}
!macroend
