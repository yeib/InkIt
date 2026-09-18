Add-Type -AssemblyName System.Drawing

$apps = @{
    'inkit'  = 'public/InkIt_Logo.png'
}

$sizes = @{
    'logo_300x300.png' = @(300, 300)
    'logo_150x150.png' = @(150, 150)
    'logo_71x71.png'   = @(71, 71)
    'logo_44x44.png'   = @(44, 44)
    'logo_512x512.png' = @(512, 512)
}

$baseDir = Get-Location

foreach ($appKey in $apps.Keys) {
    $srcPath = Join-Path $baseDir $apps[$appKey]
    $outDir  = Join-Path $baseDir "store-assets\$appKey"
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir | Out-Null
    }

    $srcImg = [System.Drawing.Image]::FromFile($srcPath)

    foreach ($sizeKey in $sizes.Keys) {
        $w = $sizes[$sizeKey][0]
        $h = $sizes[$sizeKey][1]

        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($srcImg, 0, 0, $w, $h)
        $g.Dispose()

        $destPath = Join-Path $outDir $sizeKey
        $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    }

    $srcImg.Dispose()
    Write-Host "✅ Generados logos perfectos para $appKey en $outDir"
}
