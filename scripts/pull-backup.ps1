<#
.SYNOPSIS
Keo cac ban sao luu .age tu VPS ve may chu va giu 7 ban moi nhat.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\pull-backup.ps1
#>
[CmdletBinding()]
param(
  [string]$Destination = 'D:\ping-backups',
  [string]$KeyPath = 'D:\Ping-ssh\Ping_key.pem',
  [string]$Target = 'azureuser@20.193.75.48',
  [int]$Keep = 7
)

$ErrorActionPreference = 'Stop'
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

function Start-Ssh([string[]]$SshArguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $ssh
  $psi.Arguments = ($SshArguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  [System.Diagnostics.Process]::Start($psi)
}

# scp khong doc duoc file 0600 cua user deploy (key bi khoa forced-command), nen doc bang sudo -n qua ssh.
$list = Start-Ssh @('-i', $KeyPath, '-o', 'StrictHostKeyChecking=accept-new', $Target, 'sudo -n ls -1 /opt/ping/backups')
$names = @(
  $list.StandardOutput.ReadToEnd().Split("`n") |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match '^[A-Za-z0-9._-]+\.age$' }
)
$listError = $list.StandardError.ReadToEnd()
$list.WaitForExit()
if ($list.ExitCode -ne 0) {
  throw "Khong liet ke duoc backup: $listError"
}
if ($names.Count -eq 0) {
  Write-Host 'Chua co ban sao luu .age tren VPS.'
  exit 0
}

foreach ($name in $names) {
  $local = Join-Path $Destination $name
  if (Test-Path $local) { continue }
  $part = "$local.part"
  $remote = "/opt/ping/backups/$name"
  $download = Start-Ssh @('-i', $KeyPath, '-o', 'StrictHostKeyChecking=accept-new', $Target, "sudo -n cat $remote")
  $stream = [System.IO.File]::Create($part)
  try {
    $download.StandardOutput.BaseStream.CopyTo($stream)
  } finally {
    $stream.Close()
  }
  $downloadError = $download.StandardError.ReadToEnd()
  $download.WaitForExit()
  if ($download.ExitCode -ne 0 -or (Get-Item $part).Length -eq 0) {
    Remove-Item $part -Force -ErrorAction SilentlyContinue
    throw "Tai that bai: $name $downloadError"
  }
  Move-Item $part $local
  Write-Host "Da tai $name"
}

$old = @(Get-ChildItem -Path $Destination -Filter '*.age' | Sort-Object Name -Descending | Select-Object -Skip $Keep)
if ($old.Count -gt 0) {
  $old | Remove-Item -Force
  Write-Host "Da xoa $($old.Count) ban cu."
}
