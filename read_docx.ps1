Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = 'c:\Users\admin\Desktop\Pavan_&_Aishwarya\WeddingSnap_PRD[1].docx'
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.GetEntry('word/document.xml')
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$content = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()
$text = $content -replace '<[^>]+>', ' ' -replace '\s+', ' '
Write-Output $text
