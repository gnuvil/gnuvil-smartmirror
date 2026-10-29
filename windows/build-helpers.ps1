# windows/helpers의 C# 도우미를 Windows에 기본으로 있는 .NET Framework 컴파일러로 빌드해 windows/bin에 둔다.
# Visual Studio나 Windows SDK는 필요 없다. 결과물(exe)은 Git에 넣지 않는다.
$ErrorActionPreference = 'Stop'
$csc = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "[gnuvil] .NET Framework 4 컴파일러가 없습니다: $csc" }
$winmd = Join-Path $env:windir 'System32\WinMetadata'
$facade = Join-Path $env:windir 'Microsoft.NET\assembly\GAC_MSIL\System.Runtime\v4.0_4.0.0.0__b03f5f7f11d50a3a\System.Runtime.dll'
$out = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Force $out | Out-Null

$targets = @(
  @{ Name = 'GnuvilSmtcReader.exe'; Source = 'SmtcReader.cs'
     References = @("$winmd\Windows.Foundation.winmd", "$winmd\Windows.Media.winmd", "$winmd\Windows.Storage.winmd", $facade, 'System.Web.Extensions.dll') },
  @{ Name = 'GnuvilLoopbackBars.exe'; Source = 'LoopbackBars.cs'; References = @() },
  @{ Name = 'GnuvilDisplayBounds.exe'; Source = 'DisplayBounds.cs'; References = @('System.Windows.Forms.dll', 'System.Drawing.dll') }
)
foreach ($target in $targets) {
  $source = Join-Path $PSScriptRoot "helpers\$($target.Source)"
  $exe = Join-Path $out $target.Name
  # 실행 중인 exe는 덮어쓸 수 없으므로, 소스가 바뀌지 않았으면 건너뛴다.
  if ((Test-Path $exe) -and (Get-Item $exe).LastWriteTime -ge (Get-Item $source).LastWriteTime) {
    Write-Output "[gnuvil] 최신 상태: $($target.Name)"
    continue
  }
  $arguments = @('-nologo', '-optimize+', '-platform:x64', "-out:$exe") + ($target.References | ForEach-Object { "-r:$_" }) + $source
  & $csc @arguments
  if ($LASTEXITCODE -ne 0) { throw "[gnuvil] $($target.Source) 빌드 실패" }
  Write-Output "[gnuvil] 빌드 완료: $($target.Name)"
}
