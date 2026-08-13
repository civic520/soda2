!macro customInit
  ; 殺掉正在跑的新舊版本（舊版常駐系統匣會搶 single-instance）
  nsExec::Exec 'taskkill /F /IM "soda2.exe" /T'
  nsExec::Exec 'taskkill /F /IM "說打兔.exe" /T'
  Sleep 500
  ; 靜默移除舊的「說打兔」安裝（productName 改名前的版本）
  IfFileExists "$LOCALAPPDATA\Programs\說打兔\Uninstall 說打兔.exe" 0 skipOldUninstall
    ExecWait '"$LOCALAPPDATA\Programs\說打兔\Uninstall 說打兔.exe" /S _?=$LOCALAPPDATA\Programs\說打兔'
  skipOldUninstall:
  RMDir /r "$LOCALAPPDATA\Programs\說打兔"
!macroend