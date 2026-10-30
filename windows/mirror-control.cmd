@echo off
rem Starts, stops or restarts the smart mirror by hand (the shortcuts in Documents run this).
rem   mirror-control.cmd start | stop | restart
rem Uses only cmd, schtasks, taskkill and wmic: right after boot PowerShell takes minutes to start on this PC (HDD).
chcp 65001 >nul
setlocal
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=restart"
if /i "%ACTION%"=="stop" goto stop
if /i "%ACTION%"=="start" goto start
if /i "%ACTION%"=="restart" goto start
echo [gnuvil] 사용법: mirror-control.cmd start^|stop^|restart
exit /b 2

:start
rem "start" also restarts: if the logon task is still running (slow start, or a window left hidden), starting it again does nothing.
call :kill
rem timeout needs a console; ping works from a hidden window too.
ping -n 3 127.0.0.1 >nul
for %%t in ("Gnuvil Now Playing" "Gnuvil MagicMirror") do (
  schtasks /run /tn %%t >nul 2>&1 || (
    echo [gnuvil] %%t 작업이 없습니다. windows\install-autostart.ps1을 먼저 실행하세요.
    exit /b 1
  )
)
echo [gnuvil] 스마트미러를 켰습니다. 화면이 뜨기까지 1분쯤, 컴퓨터를 켠 직후에는 몇 분 걸립니다.
exit /b 0

:stop
call :kill
echo [gnuvil] 스마트미러를 껐습니다.
exit /b 0

:kill
schtasks /end /tn "Gnuvil Now Playing" >nul 2>&1
schtasks /end /tn "Gnuvil MagicMirror" >nul 2>&1
rem Leftover child processes. Other programs' node/electron processes are left alone.
wmic process where "(name='wscript.exe' or name='cmd.exe') and (CommandLine like '%%run-hidden.vbs%%' or CommandLine like '%%start-magicmirror.cmd%%' or CommandLine like '%%start-now-playing.cmd%%')" call terminate >nul 2>&1
wmic process where "name='node.exe' and CommandLine like '%%start-magicmirror.js%%'" call terminate >nul 2>&1
wmic process where "name='electron.exe' and ExecutablePath like '%%\\MagicMirror\\node_modules\\electron\\%%'" call terminate >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127\.0\.0\.1:8765 .*LISTENING"') do taskkill /f /pid %%p >nul 2>&1
taskkill /f /im GnuvilSmtcReader.exe >nul 2>&1
taskkill /f /im GnuvilLoopbackBars.exe >nul 2>&1
taskkill /f /im GnuvilDisplayBounds.exe >nul 2>&1
exit /b 0
