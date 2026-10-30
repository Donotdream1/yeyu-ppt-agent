param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputPdf,[switch]$UpdateFields,[switch]$SanitizeMetadata)
$ErrorActionPreference = 'Stop'
$inputPath = (Resolve-Path -LiteralPath $InputFile).Path
$outputPath = [IO.Path]::GetFullPath($OutputPdf)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.Options.UpdateLinksAtOpen = $false
  $document = $word.Documents.Open($inputPath,$false,(-not $UpdateFields),$false)
  if ($UpdateFields) {
    $document.Repaginate()
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    $document.Fields.Update() | Out-Null
    foreach ($section in $document.Sections) {
      foreach ($header in $section.Headers) { $header.Range.Fields.Update() | Out-Null }
      foreach ($footer in $section.Footers) { $footer.Range.Fields.Update() | Out-Null }
    }
    $document.Save()
  }
  $document.ExportAsFixedFormat($outputPath,17)
  Write-Output ('RENDERED:' + $document.ComputeStatistics(2))
} finally {
  if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) {
    if ($word.Documents.Count -eq 0) { $word.Quit() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
if ($SanitizeMetadata) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $package = [System.IO.Compression.ZipFile]::Open($inputPath,[System.IO.Compression.ZipArchiveMode]::Update)
  try {
    $part = $package.GetEntry('docProps/core.xml')
    if ($part) {
      $reader = New-Object IO.StreamReader($part.Open())
      try { [xml]$core = $reader.ReadToEnd() } finally { $reader.Dispose() }
      $namespaces = New-Object Xml.XmlNamespaceManager($core.NameTable)
      $namespaces.AddNamespace('dc','http://purl.org/dc/elements/1.1/')
      $namespaces.AddNamespace('cp','http://schemas.openxmlformats.org/package/2006/metadata/core-properties')
      $identity = -join ([char[]]@(0x53D9,0x5E27,0x9879,0x76EE,0x6587,0x6863))
      foreach ($node in $core.SelectNodes('//dc:creator | //cp:lastModifiedBy',$namespaces)) { $node.InnerText = $identity }
      $part.Delete()
      $replacement = $package.CreateEntry('docProps/core.xml')
      $writer = New-Object IO.StreamWriter($replacement.Open(),(New-Object Text.UTF8Encoding($false)))
      try { $writer.Write($core.OuterXml) } finally { $writer.Dispose() }
    }
  } finally { $package.Dispose() }
}
