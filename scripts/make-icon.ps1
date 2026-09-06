# Generates build/icon.ico — a 256x256 placeholder PosPilot icon.
# Create a real brand icon (256x256 .ico) in build/ and delete this script.
Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path $PSScriptRoot '..\build'
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
$outIco = Join-Path $buildDir 'icon.ico'

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded-square background
$d = 64
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
$path.AddArc(0, $size - $d, $d, $d, 90, 90)
$path.CloseFigure()

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 18, 157, 88),   # top green
    [System.Drawing.Color]::FromArgb(255, 8, 92, 60),     # bottom green
    45
)
$g.FillPath($brush, $path)

# Bold "P" centered
$font = New-Object System.Drawing.Font('Segoe UI', 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$white = [System.Drawing.Brushes]::White
$g.DrawString('P', $font, $white, $rect, $sf)

# Save PNG bytes into a MemoryStream
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$g.Dispose(); $bmp.Dispose(); $ms.Dispose()

# Wrap the PNG inside an ICO container (PNG-compressed icon, 256x256)
$fs = [System.IO.File]::Create($outIco)
$bw = New-Object System.IO.BinaryWriter($fs)
# ICONDIR
$bw.Write([uint16]0)                       # reserved
$bw.Write([uint16]1)                       # type = icon
$bw.Write([uint16]1)                       # count = 1
# ICONDIRENTRY
$bw.Write([byte]0)                         # width  (0 => 256)
$bw.Write([byte]0)                         # height (0 => 256)
$bw.Write([byte]0)                         # color count
$bw.Write([byte]0)                         # reserved
$bw.Write([uint16]1)                       # planes
$bw.Write([uint16]32)                      # bits per pixel
$bw.Write([uint32]$png.Length)             # bytes in image
$bw.Write([uint32]22)                      # offset from start of file
$bw.Write($png)
$bw.Close(); $fs.Close()

$final = Get-Item $outIco
Write-Host ("Wrote {0} ({1} bytes)" -f $final.FullName, $final.Length)