; Windows のアンインストーラーに追加する処理（electron-builder の nsis.include）
; アンインストール時に OBS の設定を元に戻し、確認のうえで設定と取り込んだ画像も削除する
!macro customUnInstall
  ${ifNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "ふくめんカメラの設定と、取り込んだキャラの画像も削除しますか？$\r$\n（「いいえ」を選ぶと残します。もう一度インストールしたときに使えます）" IDYES deleteData
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --cleanup'
    Goto cleanupDone
    deleteData:
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --cleanup --delete-data'
    cleanupDone:
  ${endIf}
!macroend
