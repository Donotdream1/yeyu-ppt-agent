param([Parameter(Mandatory=$true)][string]$InputFile,[switch]$MeasureOnly)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$ownsApplication=-not [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$application=New-Object -ComObject PowerPoint.Application
$presentation=$null
$changes=[System.Collections.Generic.List[object]]::new()
function Fit-Text($shape,$page,$id,$row,$column) {
  if($shape.HasTextFrame -ne -1 -or $shape.TextFrame2.HasText -ne -1){return}
  $frame=$shape.TextFrame2
  $before=[double]$frame.TextRange.Font.Size
  $initialBoundHeight=$frame.TextRange.BoundHeight
  $initialBoundWidth=$frame.TextRange.BoundWidth
  # Reading text bounds triggers Office's layout. A source spAutoFit frame may
  # grow at its original font size; use its current COM dimensions afterwards.
  $height=$shape.Height-$frame.MarginTop-$frame.MarginBottom
  $width=$shape.Width-$frame.MarginLeft-$frame.MarginRight
  if($MeasureOnly){
    $overflow=$initialBoundHeight -gt $height+1 -or $initialBoundWidth -gt $width+1
    if($overflow){$changes.Add([pscustomobject]@{page=$page;id=$id;row=$row;column=$column;before=$before;size=$before;mixedFont=($before -lt 0);autoSize=[int]$frame.AutoSize;availableWidth=$width;availableHeight=$height;initialBoundWidth=$initialBoundWidth;initialBoundHeight=$initialBoundHeight;overflow=$true;preserveSourceFontSize=$true;name=$shape.Name;text=$frame.TextRange.Text.Substring(0,[math]::Min(180,$frame.TextRange.Text.Length))})}
    return
  }
  if($before -lt 0){return}
  $size=$before
  $steps=0
  while(($frame.TextRange.BoundHeight -gt $height+1 -or $frame.TextRange.BoundWidth -gt $width+1) -and $size -gt 8 -and $steps -lt 40){
    $size=[math]::Max(8,$size-1)
    $frame.TextRange.Font.Size=$size
    $steps++
  }
  $overflow=$frame.TextRange.BoundHeight -gt $height+1 -or $frame.TextRange.BoundWidth -gt $width+1
  if($steps -gt 0 -or $overflow){$changes.Add([pscustomobject]@{page=$page;id=$id;row=$row;column=$column;before=$before;size=$size;availableWidth=$width;availableHeight=$height;initialBoundWidth=$initialBoundWidth;initialBoundHeight=$initialBoundHeight;overflow=$overflow;name=$shape.Name;text=$frame.TextRange.Text.Substring(0,[math]::Min(100,$frame.TextRange.Text.Length))})}
}
function Visit-Shape($shape,$page,$rotated) {
  $rotated=$rotated -or ([math]::Abs($shape.Rotation) -gt 1)
  if($shape.Type -eq 6){foreach($child in $shape.GroupItems){Visit-Shape $child $page $rotated};return}
  if($rotated){return}
  if($shape.HasTable -eq -1){for($r=1;$r -le $shape.Table.Rows.Count;$r++){for($c=1;$c -le $shape.Table.Columns.Count;$c++){Fit-Text $shape.Table.Cell($r,$c).Shape $page $shape.Id $r $c}};return}
  Fit-Text $shape $page $shape.Id 0 0
}
try{
  if($ownsApplication){$application.AutomationSecurity=3}
  $presentation=$application.Presentations.Open($InputFile,-1,0,0)
  foreach($slide in $presentation.Slides){foreach($shape in $slide.Shapes){Visit-Shape $shape $slide.SlideIndex $false}}
  ConvertTo-Json -InputObject @($changes.ToArray()) -Depth 4 -Compress
}finally{
  if($presentation){$presentation.Saved=-1;$presentation.Close()}
  if($ownsApplication){$application.Quit()}
}
