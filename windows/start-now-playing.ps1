# Windows용 Now Playing API(127.0.0.1:8765)를 시작한다. 로그는 %LOCALAPPDATA%\gnuvil\logs에 남는다.
$ErrorActionPreference = 'Stop'
$logs = Join-Path $env:LOCALAPPDATA 'gnuvil\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
Set-Location (Join-Path $PSScriptRoot 'now-playing')
& node server.js *>> (Join-Path $logs 'now-playing.log')
exit $LASTEXITCODE
