$ErrorActionPreference = 'Stop'
$sourceRoot = 'C:\Users\ENDUSER\Downloads'
$targetRoot = 'D:\bes_isd\.tmp\job-documents'
$manifestPath = 'D:\bes_isd\server\job-documents-manifest.txt'
New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$results = @()
try {
  $index = 0
  foreach ($fileName in Get-Content -LiteralPath $manifestPath) {
    $index += 1
    $sourcePath = Join-Path $sourceRoot $fileName
    if (-not (Test-Path -LiteralPath $sourcePath)) {
      $results += [pscustomobject]@{ source = $fileName; status = 'missing'; output = $null }
      continue
    }
    $safeName = ('{0:D3}_{1}.docx' -f $index, [IO.Path]::GetFileNameWithoutExtension($fileName))
    $outputPath = Join-Path $targetRoot $safeName
    $document = $null
    try {
      $document = $word.Documents.Open($sourcePath, $false, $true)
      $document.SaveAs2($outputPath, 16)
      $results += [pscustomobject]@{ source = $fileName; status = 'converted'; output = $outputPath }
    } catch {
      $results += [pscustomobject]@{ source = $fileName; status = 'error'; output = $null; error = $_.Exception.Message }
    } finally {
      if ($null -ne $document) { $document.Close($false) }
    }
  }
} finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $targetRoot 'conversion-results.json') -Encoding utf8
$results | Group-Object status | Select-Object Name,Count | Format-Table -AutoSize
