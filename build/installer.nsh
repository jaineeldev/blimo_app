; Extra steps for the Windows installer (electron-builder.json5 includes this file).
;
; The app was called DesktopBuddy before 1.2. Updating from then replaces the app, but the old
; shortcuts were made under the old name and would be left behind pointing at nothing, so they go.
!macro customInstall
  Delete "$DESKTOP\DesktopBuddy.lnk"
  Delete "$SMPROGRAMS\DesktopBuddy.lnk"
!macroend
