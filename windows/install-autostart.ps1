# 로그온할 때 Now Playing API와 MagicMirror가 시작되도록 현재 사용자 작업 스케줄러에 등록하고,
# 문서 폴더에 "Gnuvil 스마트미러" 바로가기 폴더(켜기·끄기·다시 시작·로그)와 사용 설명서를 만든다.
# 관리자 권한은 필요 없다. 지우려면 -Remove를 붙여 실행한다.
#   powershell -ExecutionPolicy Bypass -File windows\install-autostart.ps1 -MirrorDisplay 2
param(
  [string]$MirrorDisplay,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$names = @('Gnuvil Now Playing', 'Gnuvil MagicMirror')
$shortcuts = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Gnuvil 스마트미러'
if ($Remove) {
  foreach ($name in $names) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue }
  Remove-Item -Recurse -Force $shortcuts -ErrorAction SilentlyContinue
  Write-Output '[gnuvil] 자동 실행 작업과 문서 폴더의 바로가기를 지웠습니다.'
  return
}
if (-not $MirrorDisplay) { $MirrorDisplay = [Environment]::GetEnvironmentVariable('GNUVIL_MIRROR_DISPLAY', 'User') }
if (-not $MirrorDisplay) { throw '[gnuvil] -MirrorDisplay로 미러 디스플레이 번호를 지정하세요 (예: 2 → \\.\DISPLAY2).' }
# 디스플레이 번호는 비밀값이 아니므로 사용자 환경변수에 둔다. GBIS_API_KEY는 사용자가 직접 넣는다.
[Environment]::SetEnvironmentVariable('GNUVIL_MIRROR_DISPLAY', $MirrorDisplay, 'User')

& (Join-Path $PSScriptRoot 'build-helpers.ps1')
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
# 끝나면 1분 뒤 다시 실행하고, 시간 제한은 두지 않는다.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

# 부팅 직후 PowerShell은 이 PC(HDD)에서 시작에 몇 분 걸리므로, 작업은 wscript로 .cmd를 창 없이 실행한다.
$tasks = @(
  @{ Name = $names[0]; Script = 'start-now-playing.cmd'; Delay = 'PT5S' },
  # 화면 배치와 네트워크가 준비되도록 MagicMirror는 조금 늦게 띄운다.
  @{ Name = $names[1]; Script = 'start-magicmirror.cmd'; Delay = 'PT20S' }
)
$runner = Join-Path $PSScriptRoot 'run-hidden.vbs'
foreach ($task in $tasks) {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $trigger.Delay = $task.Delay
  $script = Join-Path $PSScriptRoot $task.Script
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //NoLogo `"$runner`" `"$script`"" -WorkingDirectory $PSScriptRoot
  Register-ScheduledTask -TaskName $task.Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Output "[gnuvil] 등록: $($task.Name)"
}

# 문서 폴더의 바로가기와 사용 설명서
New-Item -ItemType Directory -Force $shortcuts | Out-Null
$shell = New-Object -ComObject WScript.Shell
# 바로가기도 PowerShell 대신 .cmd를 실행한다 (부팅 직후 PowerShell이 몇 분 걸려 눌러도 안 켜지는 것처럼 보였음).
$control = Join-Path $PSScriptRoot 'mirror-control.cmd'
$links = @(
  @{ Name = '스마트미러 다시 시작'; Action = 'restart'; Icon = 238 },
  @{ Name = '스마트미러 켜기'; Action = 'start'; Icon = 137 },
  @{ Name = '스마트미러 끄기'; Action = 'stop'; Icon = 27 }
)
foreach ($link in $links) {
  $shortcut = $shell.CreateShortcut((Join-Path $shortcuts "$($link.Name).lnk"))
  $shortcut.TargetPath = $control
  $shortcut.Arguments = $link.Action
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.WindowStyle = 7
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,$($link.Icon)"
  $shortcut.Description = $link.Name
  $shortcut.Save()
}
$logs = Join-Path $env:LOCALAPPDATA 'gnuvil\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$shortcut = $shell.CreateShortcut((Join-Path $shortcuts '로그 폴더.lnk'))
$shortcut.TargetPath = $logs
$shortcut.Save()
$shortcut = $shell.CreateShortcut((Join-Path $shortcuts '스마트미러 프로그램 폴더.lnk'))
$shortcut.TargetPath = Split-Path $PSScriptRoot -Parent
$shortcut.Save()
Copy-Item (Join-Path $PSScriptRoot 'USER_GUIDE.md') (Join-Path $shortcuts 'Gnuvil 스마트미러 사용 설명서.md') -Force
Write-Output "[gnuvil] 바로가기와 사용 설명서: $shortcuts"
Write-Output '[gnuvil] 다음 로그온부터 자동으로 시작합니다. 지금 시작하려면 바로가기의 "스마트미러 켜기"를 실행하세요.'
