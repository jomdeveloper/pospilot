# Generates build/icon.ico from the branded PNG source.
Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $PSScriptRoot '..\build'
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }

$inputPng = Join-Path $buildDir 'pospilot-logo.png'
$outIco = Join-Path $buildDir 'icon.ico'

if (-not (Test-Path $inputPng)) {
    throw "Missing source image: $inputPng"
}

$img = [System.Drawing.Image]::FromFile($inputPng)
$width = 256
$height = 256

# Resize/crop to a square icon canvas for best compatibility.
$canvas = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.Clear([System.Drawing.Color]::Transparent)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$sourceRect = [System.Drawing.Rectangle]::FromLTRB(0, 0, $img.Width, $img.Height)
$destRect = [System.Drawing.Rectangle]::FromLTRB(0, 0, $width, $height)
$g.DrawImage($img, $destRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

$ms = New-Object System.IO.MemoryStream
$canvas.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$g.Dispose(); $canvas.Dispose(); $img.Dispose(); $ms.Dispose()

$fs = [System.IO.File]::Create($outIco)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]1)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([uint16]1)
$bw.Write([uint16]32)
$bw.Write([uint32]$png.Length)
$bw.Write([uint32]22)
$bw.Write($png)
$bw.Close(); $fs.Close()

$final = Get-Item $outIco
Write-Host ("Wrote {0} ({1} bytes)" -f $final.FullName, $final.Length)