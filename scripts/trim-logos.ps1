# Trims transparent padding from the brand PNGs and writes web-sized copies to
# public/brand/web/. Only crops & uniformly scales: no recolouring or distortion
# (brand guideline §5.1). Originals in public/brand/ are left untouched.
# Usage: pwsh scripts/trim-logos.ps1
param([int]$TargetHeight = 240)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common, System.Drawing.Primitives, System.Runtime.InteropServices -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Trim {
  // ignoreWhite: treat near-white pixels as background. Needed because the
  // "-symbol" files still contain the logotype painted in white.
  public static Rectangle Bounds(Bitmap bmp, byte alphaThreshold, bool ignoreWhite) {
    var data = bmp.LockBits(new Rectangle(0,0,bmp.Width,bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    int stride = data.Stride; byte[] buf = new byte[stride * bmp.Height];
    Marshal.Copy(data.Scan0, buf, 0, buf.Length); bmp.UnlockBits(data);
    int minX = bmp.Width, minY = bmp.Height, maxX = -1, maxY = -1;
    for (int y = 0; y < bmp.Height; y++) { int row = y * stride;
      for (int x = 0; x < bmp.Width; x++) { int i = row + x*4;
        bool white = buf[i] > 240 && buf[i+1] > 240 && buf[i+2] > 240;
        if (buf[i + 3] > alphaThreshold && !(ignoreWhite && white)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } } }
    if (maxX < 0) return new Rectangle(0,0,bmp.Width,bmp.Height);
    return Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
  }
}
"@

$src = Join-Path $PSScriptRoot "..\public\brand"
$out = Join-Path $src "web"
New-Item -ItemType Directory -Force $out | Out-Null

Get-ChildItem $src -Filter *.png | ForEach-Object {
  $bmp = [System.Drawing.Bitmap]::FromFile($_.FullName)
  try {
    $r = [Trim]::Bounds($bmp, 8, -not $_.Name.Contains("negative"))
    $scale = $TargetHeight / $r.Height
    $w = [int][Math]::Round($r.Width * $scale)
    $dst = New-Object System.Drawing.Bitmap($w, $TargetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0, 0, $w, $TargetHeight)), $r, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $dst.Save((Join-Path $out $_.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
    "{0}: crop {1}x{2} @({3},{4}) -> {5}x{6}" -f $_.Name, $r.Width, $r.Height, $r.X, $r.Y, $w, $TargetHeight
  } finally { $bmp.Dispose() }
}
