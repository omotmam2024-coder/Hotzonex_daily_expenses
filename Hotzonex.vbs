' Double-click this file to open Hotzonex as a desktop app.
' It launches the local server (hidden) and opens the app in its own window.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = scriptDir
' Window style 0 = hidden (no black console window). False = don't wait.
sh.Run "node --disable-warning=ExperimentalWarning """ & scriptDir & "\desktop.mjs""", 0, False
