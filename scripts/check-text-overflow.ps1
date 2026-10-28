param([Parameter(Mandatory=$true)][string]$InputFile)
$ErrorActionPreference='Stop'
$ownsApplication=-not [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$application=New-Object -ComObject PowerPoint.Application
$presentation=$null
$issues=[System.Collections.Generic.List[object]]::new()
function Inspect-Shape($shape,$page,$rotated) {
  $rotated=$rotated -or ([math]::Abs($shape.Rotation) -gt 1)
  if ($shape.Type -eq 6) { foreach($child in $shape.GroupItems) { Inspect-Shape $child $page $rotated }; return }
  if ($rotated -or $shape.HasTextFrame -ne -1 -or $shape.TextFrame2.HasText -ne -1) { return }
  $frame=$shape.TextFrame2
  $height=$shape.Height-$frame.MarginTop-$frame.MarginBottom
  if ($frame.TextRange.BoundHeight -gt $height+2) {
    $issues.Add([pscustomobject]@{page=$page;name=$shape.Name;height=[math]::Round($height,1);bound=[math]::Round($frame.TextRange.BoundHeight,1);text=$frame.TextRange.Text.Substring(0,[math]::Min(55,$frame.TextRange.Text.Length))})
  }
}
try {
  $presentation=$application.Presentations.Open($InputFile,-1,0,0)
  foreach($slide in $presentation.Slides) { foreach($shape in $slide.Shapes) { Inspect-Shape $shape $slide.SlideIndex $false } }
  ConvertTo-Json -InputObject @($issues.ToArray()) -Depth 4 -Compress
} finally {
  if($presentation){$presentation.Close()}
  if($ownsApplication){$application.Quit()}
}
