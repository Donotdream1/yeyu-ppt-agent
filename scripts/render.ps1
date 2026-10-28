param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputDir)
$ErrorActionPreference = 'Stop'
# Reuse a running application only to open our own read-only, windowless document.
# Close only that document; never quit an application that belonged to the user.
$ownsApplication = -not [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$presentation = $null
$application = $null
try {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  $application = New-Object -ComObject PowerPoint.Application
  if ($ownsApplication) { $application.AutomationSecurity = 3 }
  $presentation = $application.Presentations.Open($InputFile, -1, 0, 0)
  foreach ($slide in $presentation.Slides) {
    $target = Join-Path $OutputDir ($slide.SlideIndex.ToString() + '.png')
    $slide.Export($target, 'PNG', 1280, 720)
  }
  Write-Output ('RENDERED:' + $presentation.Slides.Count)
} catch {
  Write-Error $_
  exit 1
} finally {
  if ($presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
  if ($application) { if ($ownsApplication) { $application.Quit() }; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($application) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
