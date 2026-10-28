param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputDir,[Parameter(Mandatory=$true)][string]$SlidePages)
$ErrorActionPreference='Stop'
$ownsApplication=-not [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$app=$null;$deck=$null
try{
 New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
 $app=New-Object -ComObject PowerPoint.Application
 if($ownsApplication){$app.AutomationSecurity=3}
 $deck=$app.Presentations.Open($InputFile,-1,0,0)
 foreach($number in ($SlidePages.Split(',') | ForEach-Object {[int]$_} | Select-Object -Unique)){
  if($number -lt 1 -or $number -gt $deck.Slides.Count){throw '素材页码无效'}
  $deck.Slides.Item($number).Export((Join-Path $OutputDir ($number.ToString()+'.png')),'PNG',1600,900)
 }
 Write-Output 'SELECTED_PAGES_RENDERED'
}finally{if($deck){$deck.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($deck)};if($app){if($ownsApplication){$app.Quit()};[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}}
