# Đo lỗi phía client khi `docker compose up -d --wait` thay các bản sao API (stack pingprod local, HTTPS, CA local).
#   powershell -File tools/loadtest/compose-rollout.ps1 -Seconds 90
# Đổi biến ROLL_MARK trong file env tạm để buộc compose recreate api, rồi poll /api/v1/health qua nginx.
param([int]$Seconds = 90, [ValidateSet('rolling','parallel')][string]$Mode = 'rolling', [string]$ExtraOverride = '')
$ErrorActionPreference = 'Continue'
$root = Join-Path $env:LOCALAPPDATA 'Ping\local-deploy'
$envSrc = Join-Path $root 'local.env'
$tmpEnv = Join-Path $root 'local-rollout.env'
$dc = @('-p','pingprod','-f','docker-compose.prod.example.yml','-f','docker-compose.prod.tls.yml','-f','docker-compose.local.yml','--env-file',$tmpEnv)
Copy-Item $envSrc $tmpEnv -Force
Add-Content $tmpEnv "ROLL_MARK=$(Get-Date -Format o)"
# Biến này phải xuất hiện trong định nghĩa api để compose thấy cấu hình đổi: dùng override tạm.
$override = Join-Path $root 'rollout-override.yml'
@"
services:
  api-1:
    environment:
      ROLL_MARK: `${ROLL_MARK:-none}
  api-2:
    environment:
      ROLL_MARK: `${ROLL_MARK:-none}
"@ | Set-Content -Encoding utf8 $override
$dc += @('-f', $override)
if ($ExtraOverride) { $dc += @('-f', $ExtraOverride) }

$job = Start-Job -ArgumentList $Seconds -ScriptBlock {
  param($seconds)
  $ok = 0; $bad = 0; $codes = @{}
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    $c = & curl.exe -sk -m 3 -o NUL -w '%{http_code}' https://localhost:8443/api/v1/health
    if ($c -eq '200') { $ok++ } else { $bad++; $codes[$c] = 1 + [int]$codes[$c] }
  }
  [pscustomobject]@{ ok = $ok; bad = $bad; codes = ($codes.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ',' }
}
Start-Sleep -Seconds 3
$t = Get-Date
# Giống roll_up() trong deploy/deploy.sh: lần lượt từng bản sao, bản còn lại giữ phục vụ.
if ($Mode -eq 'parallel') { docker compose @dc up -d --wait --wait-timeout 180 api-1 api-2 2>&1 | Out-Null }
else {
  docker compose @dc up -d --wait --wait-timeout 180 --no-deps api-1 2>&1 | Out-Null
  docker compose @dc up -d --wait --wait-timeout 180 --no-deps api-2 2>&1 | Out-Null
}
$elapsed = [int]((Get-Date) - $t).TotalSeconds
$res = Receive-Job -Job $job -Wait
Remove-Job $job
Remove-Item $tmpEnv, $override -Force
"[$Mode] compose up mất $elapsed giây; request ok=$($res.ok) bad=$($res.bad) mã=$($res.codes)"
