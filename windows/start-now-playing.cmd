@echo off
rem Starts the Windows Now Playing API (127.0.0.1:8765). Log: %LOCALAPPDATA%\gnuvil\logs\now-playing.log
if not exist "%LOCALAPPDATA%\gnuvil\logs" mkdir "%LOCALAPPDATA%\gnuvil\logs"
cd /d "%~dp0now-playing"
node server.js >> "%LOCALAPPDATA%\gnuvil\logs\now-playing.log" 2>&1
