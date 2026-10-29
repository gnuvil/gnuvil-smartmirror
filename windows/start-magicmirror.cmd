@echo off
rem Starts MagicMirror on the mirror display (GNUVIL_MIRROR_DISPLAY). Log: %LOCALAPPDATA%\gnuvil\logs\magicmirror.log
if not exist "%LOCALAPPDATA%\gnuvil\logs" mkdir "%LOCALAPPDATA%\gnuvil\logs"
node "%~dp0launcher\start-magicmirror.js" >> "%LOCALAPPDATA%\gnuvil\logs\magicmirror.log" 2>&1
