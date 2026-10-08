$ErrorActionPreference = "Stop"

# Works when executed via `irm ... | iex` (no param(...) block).
# Optional: $env:VOXIVA_REPO  $env:VOXIVA_ASSET_PATTERN
$Repo = if ($env:VOXIVA_REPO) { $env:VOXIVA_REPO } else { "voxiva-ai/voxiva-space" }
$AssetPattern = if ($env:VOXIVA_ASSET_PATTERN) { $env:VOXIVA_ASSET_PATTERN } else { "*.exe" }

function Get-LatestRelease {
  $url = "https://api.github.com/repos/$Repo/releases?per_page=20"
  $releases = @(Invoke-RestMethod -Uri $url -Headers @{
    "User-Agent" = "VoxivaSpaceInstaller"
    "Accept"     = "application/vnd.github+json"
  })
  $release = $releases | Where-Object { -not $_.draft } | Select-Object -First 1
  if (-not $release) { throw "No published release found." }
  return $release
}

function Find-SpaceExe {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA        "Programs\Voxiva Space\Voxiva Space.exe"),
    (Join-Path $env:ProgramFiles        "Voxiva Space\Voxiva Space.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Voxiva Space\Voxiva Space.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($candidates.Count -gt 0) { return $candidates[0] }
  return $null
}

function Ensure-DesktopShortcut([string]$ExePath) {
  if (-not $ExePath -or -not (Test-Path $ExePath)) { return }
  $desktop = [Environment]::GetFolderPath("Desktop")
  $lnk = Join-Path $desktop "Voxiva Space.lnk"
  if (Test-Path $lnk) { return }
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = $ExePath
  $sc.WorkingDirectory = Split-Path $ExePath -Parent
  $sc.Description = "Voxiva Space"
  $sc.Save()
}

Write-Host "Voxiva Space"
Write-Host "Downloading..."

$rel = Get-LatestRelease
$asset = $rel.assets | Where-Object { $_.name -like $AssetPattern } | Select-Object -First 1
if (-not $asset -and $AssetPattern -ne "*.msi") {
  $asset = $rel.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
}
if (-not $asset) { throw "No installer in the newest published release." }

$tmp = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp

Write-Host "Installing..."
$ext = [System.IO.Path]::GetExtension($tmp).ToLowerInvariant()
if ($ext -eq ".msi") {
  $p = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @("/i", "`"$tmp`"", "/qn", "/norestart")
} else {
  $p = Start-Process -FilePath $tmp -Wait -PassThru -ArgumentList @("/S")
}
if ($p.ExitCode -ne 0) { throw "Install failed. Run PowerShell as Administrator and retry." }

Start-Sleep -Milliseconds 700
$exe = Find-SpaceExe
Ensure-DesktopShortcut $exe

if ($exe) {
  Start-Process -FilePath $exe
}

Write-Host "Done."
