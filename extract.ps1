Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-Docx {
    param($Path)
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    $entry = $zip.GetEntry('word/document.xml')
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $content = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    $zip.Dispose()
    
    $text = $content -replace '</w:p>', "`n" -replace '<[^>]+>', ''
    return $text
}

$path1 = 'c:\Users\admin\Desktop\Pavan_&_Aishwarya\WeddingSnap_PRD[1].docx'
$path2 = 'c:\Users\admin\Desktop\Pavan_&_Aishwarya\WeddingSnap_Comic_Universe_Design_Guide.docx'

Read-Docx $path1 | Out-File 'c:\Users\admin\Desktop\Pavan_&_Aishwarya\prd.txt'
Read-Docx $path2 | Out-File 'c:\Users\admin\Desktop\Pavan_&_Aishwarya\guide.txt'
