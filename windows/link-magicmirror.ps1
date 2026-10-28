# 레포의 config, css/custom.css, MMM-Gnuvil* 모듈을 MagicMirror 설치 폴더에 연결한다.
# 관리자 권한 없이 되도록 폴더는 정션, 파일은 하드링크를 쓴다. 여러 번 실행해도 된다.
param(
  [string]$MagicMirror = $(if ($env:GNUVIL_MM_DIR) { $env:GNUVIL_MM_DIR } else { Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'MagicMirror' })
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $MagicMirror 'js\electron.js'))) { throw "[gnuvil] MagicMirror 설치 폴더를 찾을 수 없습니다: $MagicMirror" }

function Set-Junction([string]$link, [string]$target) {
  $item = Get-Item $link -Force -ErrorAction SilentlyContinue
  if ($item -and $item.LinkType -eq 'Junction' -and ($item.Target | Select-Object -First 1) -eq $target) { return }
  if ($item) {
    if ($item.LinkType) { $item.Delete() }
    else { Rename-Item $link "$link.orig-$(Get-Date -Format yyyyMMddHHmmss)" }
  }
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
}

# MagicMirror의 config 폴더에는 예시 파일만 있으므로 폴더째 레포를 가리키게 한다.
Set-Junction (Join-Path $MagicMirror 'config') (Join-Path $repo 'config')
Get-ChildItem (Join-Path $repo 'modules') -Directory -Filter 'MMM-Gnuvil*' | ForEach-Object {
  Set-Junction (Join-Path $MagicMirror "modules\$($_.Name)") $_.FullName
}

# git이 custom.css를 새 파일로 바꾸면 하드링크가 끊기므로 매번 다시 만든다.
$css = Join-Path $MagicMirror 'css\custom.css'
if (Test-Path $css) { Remove-Item $css -Force }
New-Item -ItemType HardLink -Path $css -Target (Join-Path $repo 'css\custom.css') | Out-Null
Write-Output "[gnuvil] MagicMirror 연결 완료: $MagicMirror"
