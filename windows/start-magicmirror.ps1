# MagicMirror를 미러 디스플레이에 전체화면으로 띄운다.
# 디스플레이는 GNUVIL_MIRROR_DISPLAY(예: 2 → \\.\DISPLAY2)로 고르고, 좌표는 실행할 때마다 Windows에서 읽는다.
param(
  [string]$MagicMirror = $(if ($env:GNUVIL_MM_DIR) { $env:GNUVIL_MM_DIR } else { Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'MagicMirror' }),
  [string]$Display = $env:GNUVIL_MIRROR_DISPLAY
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'link-magicmirror.ps1') -MagicMirror $MagicMirror

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$screen = $screens | Where-Object { $Display -and $_.DeviceName -eq "\\.\DISPLAY$Display" } | Select-Object -First 1
if ($screen) {
  $b = $screen.Bounds
  $env:GNUVIL_MIRROR_BOUNDS = "$($b.X),$($b.Y),$($b.Width),$($b.Height)"
  Write-Output "[gnuvil] 미러 디스플레이 $($screen.DeviceName): $env:GNUVIL_MIRROR_BOUNDS"
} else {
  Remove-Item Env:GNUVIL_MIRROR_BOUNDS -ErrorAction SilentlyContinue
  Write-Warning "[gnuvil] 미러 디스플레이 '$Display'를 찾지 못해 주 화면에 띄웁니다. 연결된 화면: $(($screens.DeviceName) -join ', ')"
}

if (-not $env:GNUVIL_NOW_PLAYING_URL) { $env:GNUVIL_NOW_PLAYING_URL = 'http://127.0.0.1:8765/now-playing' }
# 시각화 도우미는 MagicMirror(MMM-GnuvilVisualizer)가 직접 실행한다.
$helper = Join-Path $PSScriptRoot 'bin\GnuvilLoopbackBars.exe'
if (Test-Path $helper) { $env:GNUVIL_VISUALIZER_COMMAND = $helper }

$logs = Join-Path $env:LOCALAPPDATA 'gnuvil\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
Set-Location $MagicMirror
& node --run start:windows *>> (Join-Path $logs 'magicmirror.log')
exit $LASTEXITCODE
