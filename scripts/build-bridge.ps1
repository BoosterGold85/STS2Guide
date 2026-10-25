param(
    [string]$GameDir = "${env:ProgramFiles(x86)}\Steam\steamapps\common\Slay the Spire 2"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $GameDir 'data_sts2_windows_x86_64'
foreach ($name in @('sts2.dll', 'GodotSharp.dll')) {
    if (-not (Test-Path (Join-Path $data $name))) { throw "Missing $name in $data" }
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw '.NET 9 SDK is required to build. No software has been installed and no game files have been changed.'
}
$out = Join-Path $root 'artifacts\RunCoach.ReadOnly'
dotnet build (Join-Path $root 'bridge\RunCoach.ReadOnly\RunCoach.ReadOnly.csproj') -c Release -o $out "-p:GameDataDir=$data"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item (Join-Path $root 'bridge\RunCoach.ReadOnly\RunCoach.ReadOnly.json') $out
Write-Host "Built in $out. Nothing was copied to the game. Compatibility must still be tested."
