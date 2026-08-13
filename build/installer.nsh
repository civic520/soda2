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

; 安裝開始前檢查：若使用者把安裝目錄選在 Program Files，
; Windows 會限制該位置的應用存取麥克風（即使權限顯示允許）→ 錄音會錄到靜音。
; 提醒改用使用者目錄。
!macro customInstall
  ${If} $INSTDIR == $PROGRAMFILES
  ${OrIf} $INSTDIR == "$PROGRAMFILES\soda2"
  ${OrIf} $INSTDIR == "$PROGRAMFILES\說打兔"
  ${OrIf} $INSTDIR == "$PROGRAMFILES64"
  ${OrIf} $INSTDIR == "$PROGRAMFILES64\soda2"
  ${OrIf} $INSTDIR == "$PROGRAMFILES64\說打兔"
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "偵測到安裝目錄位於 Program Files。$\n$\nWindows 會限制該位置的應用程式存取麥克風，導致語音輸入錄到靜音（音量測試無反應、無文字輸出）。$\n$\n建議改用使用者目錄安裝（例如 %LOCALAPPDATA%\Programs\soda2）。$\n$\n是否繼續安裝到此位置？" IDYES ok_programfiles
      Abort "請重新安裝到使用者目錄（預設 %LOCALAPPDATA%\Programs\soda2）"
    ok_programfiles:
  ${EndIf}
!macroend