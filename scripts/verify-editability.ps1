param([Parameter(Mandatory=$true)][string]$InputFile)
$ErrorActionPreference='Stop'
$ownsApplication=-not [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$a=New-Object -ComObject PowerPoint.Application
$p=$null
try {
  $p=$a.Presentations.Open($InputFile,-1,0,0)
  $result=@()
  foreach($slide in $p.Slides){
    $counts=@{groups=0;freeforms=0;charts=0;tables=0;text=0;pictures=0;connectors=0}
    function Inspect-Shapes($shapes){foreach($shape in $shapes){if($shape.Type -eq 6){$counts.groups++;Inspect-Shapes $shape.GroupItems};if($shape.Type -eq 5){$counts.freeforms++};if($shape.HasChart -eq -1){$counts.charts++};if($shape.HasTable -eq -1){$counts.tables++};if($shape.Type -eq 13){$counts.pictures++};if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){$counts.text++};if($shape.Connector -eq -1){$counts.connectors++}}}
    Inspect-Shapes $slide.Shapes
    $result+=@{page=$slide.SlideIndex;nativeObjects=$counts}
  }
  $result|ConvertTo-Json -Depth 5 -Compress
} finally {if($p){$p.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($p)};if($ownsApplication){$a.Quit()};[void][Runtime.InteropServices.Marshal]::ReleaseComObject($a)}
