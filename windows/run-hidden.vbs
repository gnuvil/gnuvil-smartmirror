' Runs the given .cmd file without a console window and waits until it exits,
' so the scheduled task stays "Running" (and is restarted) while the program runs.
' Used instead of PowerShell at logon: on this PC (HDD) PowerShell takes minutes to start right after boot.
Set shell = CreateObject("WScript.Shell")
WScript.Quit shell.Run("cmd /c """ & WScript.Arguments(0) & """", 0, True)
