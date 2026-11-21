' Launches Gardenscapes Tool with no console window.
' The EXE is already a windowed build (console=False in igg_client.spec), so
' this launcher is only a convenience for pinning it to the taskbar. Running
' Gardenscapes Tool.exe directly is equivalent.
Option Explicit
Dim fso, shell, here, exePath
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = here & "\Gardenscapes Tool.exe"
If Not fso.FileExists(exePath) Then
  MsgBox "Gardenscapes Tool.exe not found next to this launcher.", 16, "Gardenscapes Tool"
  WScript.Quit 1
End If
' 0 = hidden window, False = do not wait
shell.Run """" & exePath & """", 0, False
