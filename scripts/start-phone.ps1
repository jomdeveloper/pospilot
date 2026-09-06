$ErrorActionPreference = 'Stop'

function Get-LanAddress {
  $address = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp |
    Where-Object {
      $_.IPAddress -notlike '169.254.*' -and
      $_.IPAddress -notlike '127.*' -and
      $_.InterfaceAlias -notmatch 'vEthernet|Loopback|Virtual|VPN|Bluetooth'
    } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress

  if (-not $address) {
    throw 'Could not find a LAN IPv4 address. Check that Wi-Fi or Ethernet is connected.'
  }

  return $address
}

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  throw 'mkcert is not installed or is not on PATH. Install the official mkcert executable first.'
}

function Invoke-Mkcert {
  & mkcert @args
  if ($LASTEXITCODE -ne 0) {
    throw "mkcert failed with exit code $LASTEXITCODE. Check the command output above."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $projectRoot 'certs'
$lanAddress = Get-LanAddress
$keyPath = Join-Path $certificateDirectory 'pospilot-key.pem'
$certificatePath = Join-Path $certificateDirectory 'pospilot.pem'

New-Item -ItemType Directory -Force $certificateDirectory | Out-Null
Invoke-Mkcert -install
Invoke-Mkcert -key-file $keyPath -cert-file $certificatePath $lanAddress localhost 127.0.0.1

if (-not (Test-Path $keyPath) -or -not (Test-Path $certificatePath)) {
  throw 'mkcert completed without creating the expected certificate files.'
}

$env:VITE_HTTPS_KEY = $keyPath
$env:VITE_HTTPS_CERT = $certificatePath
$env:VITE_HMR_HOST = $lanAddress
$env:HTTPS_KEY_PATH = $keyPath
$env:HTTPS_CERT_PATH = $certificatePath

# LAN/phone access needs the API bound to all interfaces (default is loopback-only).
$env:HOST = '0.0.0.0'

Write-Host "Starting PosPilot over HTTPS at https://${lanAddress}:5173"
Write-Host 'Allow camera permission when prompted on the phone.'
npm run dev