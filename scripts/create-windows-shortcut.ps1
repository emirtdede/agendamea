# Agendamea - Windows Masaustu ve Baslat Menusu Kisayol Olusturucu
$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$TargetBat = Join-Path $PSScriptRoot "start-app.bat"
$IconPath = Join-Path $ProjectDir "public\icons\agendamea.ico"

if (-not (Test-Path $TargetBat)) {
  throw "start-app.bat not found: $TargetBat"
}
if (-not (Test-Path $IconPath)) {
  throw "agendamea.ico bulunamadi: $IconPath"
}

$WshShell = New-Object -ComObject WScript.Shell

$ShortcutLocations = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "Agendamea.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Agendamea.lnk")
)

foreach ($lnk in $ShortcutLocations) {
  $Shortcut = $WshShell.CreateShortcut($lnk)
  $Shortcut.TargetPath = $TargetBat
  $Shortcut.WorkingDirectory = $ProjectDir
  $Shortcut.IconLocation = "$IconPath,0"
  $Shortcut.Description = "Agendamea - Hizli ve Minimalist Yapilacaklar"
  $Shortcut.WindowStyle = 7
  $Shortcut.Save()
  Write-Host "Kisayol olusturuldu: $lnk"
}
