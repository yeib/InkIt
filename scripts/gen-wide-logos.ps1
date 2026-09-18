Add-Type -AssemblyName System.Drawing

function Make-WideLogo([string]$iconPath, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap 310, 150
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # Fill dark background #0f172a
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#0f172a"))
    $g.FillRectangle($brush, 0, 0, 310, 150)
    
    if (Test-Path $iconPath) {
        $srcImg = [System.Drawing.Image]::FromFile($iconPath)
        # Draw icon centered 110x110
        $size = 110
        $x = [int]((310 - $size) / 2)
        $y = [int]((150 - $size) / 2)
        $g.DrawImage($srcImg, $x, $y, $size, $size)
        $srcImg.Dispose()
    }
    
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated Wide Tile: $outPath"
}

Make-WideLogo "$PSScriptRoot\..\src-tauri\icons\icon.png" "$PSScriptRoot\..\src-tauri\icons\Wide310x150Logo.png"
