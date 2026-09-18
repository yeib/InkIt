Add-Type -AssemblyName System.Drawing

$apps = @{
    'inkit' = @{ logo = 'public/InkIt_Logo.png'; color1 = '#0f172a'; color2 = '#1e3a8a'; glow = '#3b82f6' }
}

$baseDir = Get-Location
$posterWidth = 720
$posterHeight = 1080

foreach ($appKey in $apps.Keys) {
    $info = $apps[$appKey]
    $srcPath = Join-Path $baseDir $info.logo
    $outDir  = Join-Path $baseDir "store-assets\$appKey"
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($posterWidth, $posterHeight)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    # Linear background gradient
    $c1 = [System.Drawing.ColorTranslator]::FromHtml($info.color1)
    $c2 = [System.Drawing.ColorTranslator]::FromHtml($info.color2)
    $rect = New-Object System.Drawing.Rectangle(0, 0, $posterWidth, $posterHeight)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($bgBrush, $rect)
    $bgBrush.Dispose()

    # Center soft radial glow
    $glowColor = [System.Drawing.ColorTranslator]::FromHtml($info.glow)
    $glowCenter = New-Object System.Drawing.PointF(($posterWidth / 2), ($posterHeight / 2))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(($posterWidth / 2 - 250), ($posterHeight / 2 - 250), 500, 500)
    
    $pbr = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
    $pbr.CenterColor = [System.Drawing.Color]::FromArgb(70, $glowColor.R, $glowColor.G, $glowColor.B)
    $pbr.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $c1.R, $c1.G, $c1.B))
    $g.FillPath($pbr, $path)
    $pbr.Dispose()
    $path.Dispose()

    # Draw centered logo (320x320)
    if (Test-Path $srcPath) {
        $logoImg = [System.Drawing.Image]::FromFile($srcPath)
        $logoSize = 320
        $logoX = ($posterWidth - $logoSize) / 2
        $logoY = ($posterHeight - $logoSize) / 2
        $g.DrawImage($logoImg, $logoX, $logoY, $logoSize, $logoSize)
        $logoImg.Dispose()
    }

    $g.Dispose()

    $destPath = Join-Path $outDir "poster_720x1080.png"
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "?? Poster 720x1080 generado para $appKey en $destPath"
}
