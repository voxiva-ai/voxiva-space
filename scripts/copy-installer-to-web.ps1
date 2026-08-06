#Requires -Version 5.1
<#
  Copies the newest NSIS setup.exe from src-tauri/target/release/bundle/nsis
  to Voxiva Web public/downloads as voxiva-space-windows-setup.exe.

  Then set on the server (e.g. Vercel):
    VOXIVA_SPACE_PUBLIC_INSTALLER_PATH=/downloads/voxiva-space-windows-setup.exe
  Or full URL:
    VOXIVA_SPACE_WINDOWS_INSTALLER_URL=https://your-domain/downloads/voxiva-space-windows-setup.exe
#>
$ErrorActionPreference = "Stop"
$spaceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nsisDir = Join-Path $spaceRoot "src-tauri\target\release\bundle\nsis"
$destDir = Join-Path $spaceRoot "..\Voxiva Web\public\downloads"
$destFile = Join-Path $destDir "voxiva-space-windows-setup.exe"

if (-not (Test-Path $nsisDir)) {
  throw "Run scripts/build-windows-release.ps1 first. Missing: $nsisDir"
}

$exe = Get-ChildItem -Path $nsisDir -Filter "*setup*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { throw "No *setup*.exe in $nsisDir" }

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Force -Path $exe.FullName -Destination $destFile
Write-Host "Copied to:" -ForegroundColor Green
Write-Host "  $destFile"
