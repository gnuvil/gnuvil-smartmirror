# 스마트미러를 손으로 켜고 끄는 스크립트 (문서 폴더의 바로가기가 이것을 실행한다).
#   mirror-control.ps1 start | stop | restart
param([ValidateSet('start', 'stop', 'restart')][string]$Action = 'restart')
$ErrorActionPreference = 'Stop'
$tasks = @('Gnuvil Now Playing', 'Gnuvil MagicMirror')
$magicMirror = if ($env:GNUVIL_MM_DIR) { $env:GNUVIL_MM_DIR } else { Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'MagicMirror' }

function Stop-Mirror {
  foreach ($task in $tasks) { Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue }
  # 작업을 멈춰도 남는 하위 프로세스를 정리한다. 다른 프로그램의 node는 건드리지 않는다.
  $api = (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue).OwningProcess
  Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -in $api -or
    $_.Name -in @('GnuvilSmtcReader.exe', 'GnuvilLoopbackBars.exe') -or
    ($_.Name -eq 'electron.exe' -and $_.ExecutablePath -like "$magicMirror\*") -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'start-magicmirror\.js') -or
    ($_.Name -in @('wscript.exe', 'cmd.exe') -and $_.CommandLine -match 'run-hidden\.vbs|start-(magicmirror|now-playing)\.cmd')
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Start-Mirror {
  foreach ($task in $tasks) {
    if (-not (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue)) {
      throw "[gnuvil] '$task' 작업이 없습니다. windows\install-autostart.ps1을 먼저 실행하세요."
    }
    Start-ScheduledTask -TaskName $task
  }
}

switch ($Action) {
  'stop' { Stop-Mirror; Write-Output '[gnuvil] 스마트미러를 껐습니다.' }
  'start' { Start-Mirror; Write-Output '[gnuvil] 스마트미러를 켰습니다. 화면이 뜨기까지 30초쯤 걸립니다.' }
  'restart' { Stop-Mirror; Start-Sleep -Seconds 2; Start-Mirror; Write-Output '[gnuvil] 스마트미러를 다시 시작했습니다. 화면이 뜨기까지 30초쯤 걸립니다.' }
}
