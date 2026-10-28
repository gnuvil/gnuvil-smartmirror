# 로그온할 때 Now Playing API와 MagicMirror가 시작되도록 현재 사용자 작업 스케줄러에 등록한다.
# 관리자 권한은 필요 없다. 지우려면 -Remove를 붙여 실행한다.
#   powershell -ExecutionPolicy Bypass -File windows\install-autostart.ps1 -MirrorDisplay 2
param(
  [string]$MirrorDisplay,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$names = @('Gnuvil Now Playing', 'Gnuvil MagicMirror')
if ($Remove) {
  foreach ($name in $names) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue }
  Write-Output '[gnuvil] 자동 실행 작업을 지웠습니다.'
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

$tasks = @(
  @{ Name = $names[0]; Script = 'start-now-playing.ps1'; Delay = 'PT5S' },
  # 화면 배치와 네트워크가 준비되도록 MagicMirror는 조금 늦게 띄운다.
  @{ Name = $names[1]; Script = 'start-magicmirror.ps1'; Delay = 'PT20S' }
)
foreach ($task in $tasks) {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $trigger.Delay = $task.Delay
  $script = Join-Path $PSScriptRoot $task.Script
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $PSScriptRoot
  Register-ScheduledTask -TaskName $task.Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Output "[gnuvil] 등록: $($task.Name)"
}
Write-Output "[gnuvil] 다음 로그온부터 자동으로 시작합니다. 지금 시작하려면: Start-ScheduledTask -TaskName '$($names[0])'; Start-ScheduledTask -TaskName '$($names[1])'"
