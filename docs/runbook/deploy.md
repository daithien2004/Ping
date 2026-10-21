# Triển khai local bằng Docker Desktop (Windows)

Mục tiêu: tự vận hành bản build production tại **https://localhost:8443** qua Nginx. Đây là môi trường
luyện tập trên máy bạn; tiêu chí staging/cloud trong checklist nghiệm thu vẫn còn chờ.
Quyết định và bằng chứng: [ADR-0036](../adr/0036-local-deployment.md).

Các lệnh **PowerShell** dưới đây chạy ở gốc repo, với Node/pnpm theo README, Docker Desktop chạy
Linux containers, Compose >= 2.24.4 và OpenSSL có sẵn trong PATH. Không cần cài Nginx hoặc VM.
API/web/Postgres/Redis chạy trong container; chỉ Nginx mở cổng trên loopback.

## 1. Chuẩn bị thư mục và chứng chỉ

```powershell
$deploymentRoot = Join-Path $env:LOCALAPPDATA 'Ping\local-deploy'
$tlsRoot = Join-Path $deploymentRoot 'tls'
$envFile = Join-Path $deploymentRoot 'local.env'
New-Item -ItemType Directory -Path $deploymentRoot -Force | Out-Null
node scripts/local-certificates.mjs $tlsRoot
if ($LASTEXITCODE -ne 0) { throw 'Không tạo được chứng chỉ local' }
```

Script tạo CA riêng ở `tls/ca`, chứng chỉ và khóa server ở `tls/server`. Nginx chỉ mount thư mục
server; khóa CA không được đưa vào container. CA có hạn một năm, chứng chỉ server 90 ngày. Chạy lại
giữ nguyên các file hợp lệ; trạng thái thiếu file hoặc hết hạn sẽ báo lỗi để bạn kiểm tra.

Script không sửa kho tin cậy của Windows. Để Chrome/Edge không cảnh báo, **bạn thực hiện**:

```powershell
$caFile = Join-Path $tlsRoot 'ca/root-ca.pem'
$caCer = Join-Path $tlsRoot 'ca/root-ca.cer'
openssl x509 -in $caFile -noout -fingerprint -sha256
# Kiểm fingerprint của CA vừa tạo, rồi xuất và tin CA cho user Windows hiện tại:
openssl x509 -in $caFile -outform DER -out $caCer
if ($LASTEXITCODE -ne 0) { throw 'Không xuất được CA' }
$trustedCA = Import-Certificate -FilePath $caCer -CertStoreLocation Cert:\CurrentUser\Root
```

CA được tin có quyền cấp chứng chỉ; chỉ tin CA bạn vừa tạo, giữ khóa CA riêng trong profile của bạn.
Đóng/mở lại trình duyệt nếu nó vẫn cảnh báo. Cách gỡ khi không còn dùng:
`Remove-Item -LiteralPath "Cert:\CurrentUser\Root\$($trustedCA.Thumbprint)"` trong cùng phiên PowerShell.
Nếu không còn biến `$trustedCA`, xác định đúng thumbprint của CA đó trước khi gỡ, không xóa theo wildcard.

## 2. Tạo env riêng, giữ thông tin kết nối volume hiện có

`pingprod_pgdata` là DB luyện tập, tách khỏi DB dev `ping_pgdata`. Password của volume đã khởi tạo
phải khớp env ban đầu: đổi `POSTGRES_PASSWORD` trong env không đổi password trong DB.
Đoạn dưới tạo `local.env` một lần, ưu tiên lấy credentials từ `.env.prod` hiện có; file đã có thì giữ nguyên.

```powershell
if (-not (Test-Path -LiteralPath $envFile)) {
  if (Test-Path -LiteralPath '.env.prod') {
    $settings = @(Get-Content -LiteralPath '.env.prod' | Where-Object {
      $_ -notmatch '^(PUBLIC_URL|BIND_ADDRESS|HTTP_PORT|HTTPS_PORT|TLS_CERT_DIR|PING_RELEASE|SENTRY_DSN|NEXT_PUBLIC_SENTRY_DSN)='
    })
  } else {
    docker volume inspect pingprod_pgdata *> $null
    if ($LASTEXITCODE -eq 0) { throw 'Volume đã có: cần lấy đúng credentials cũ trước' }
    $secrets = node -e "const c=require('node:crypto');console.log(JSON.stringify({db:c.randomBytes(24).toString('hex'),jwt:c.randomBytes(32).toString('hex')}))" | ConvertFrom-Json
    $settings = @("POSTGRES_PASSWORD=$($secrets.db)", "JWT_ACCESS_SECRET=$($secrets.jwt)")
  }
  $settings += @(
    'PUBLIC_URL=https://localhost:8443', 'BIND_ADDRESS=127.0.0.1',
    'HTTP_PORT=8080', 'HTTPS_PORT=8443',
    ('TLS_CERT_DIR=' + (Join-Path $tlsRoot 'server').Replace('\', '/')),
    'PING_RELEASE=practice-a', 'SENTRY_DSN=', 'NEXT_PUBLIC_SENTRY_DSN='
  )
  [IO.File]::WriteAllLines($envFile, $settings, [Text.UTF8Encoding]::new($false))
}
```

Env, chứng chỉ và backup nằm ngoài repo ở `%LOCALAPPDATA%\Ping\local-deploy`. Không in/chia sẻ
file env hay khóa riêng. Sentry của môi trường luyện tập để trống; cấu hình staging sẽ làm riêng.

## 3. Build, migrate và khởi động

Đặt bộ tham số dùng chung để mọi lệnh tác động đúng project và cấu hình:

```powershell
$dc = @('-p', 'pingprod', '-f', 'docker-compose.prod.example.yml',
  '-f', 'docker-compose.prod.tls.yml', '-f', 'docker-compose.local.yml', '--env-file', $envFile)
docker compose @dc config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose không hợp lệ' }
docker compose @dc up -d --build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Stack chưa sẵn sàng; xem log' }
docker compose @dc exec -T nginx nginx -t
docker compose @dc ps -a
```

`migrate` là tác vụ một lần và phải thoát 0 trước khi API chạy; trạng thái `Exited (0)` của nó là
bình thường. API/web có healthcheck. Bản luyện tập đầu dùng `ping-local-api:practice-a`,
`ping-local-web:practice-a`, `ping-local-migrate:practice-a`; các lần phát hành thật nên dùng tag commit.

Mở **https://localhost:8443/register**, tạo tài khoản riêng cho môi trường này. Thử tạo server và
gửi tin, mở cửa sổ ẩn danh để thử người thứ hai. Đây không phải DB seed dev; tài khoản dev có thể
không tồn tại ở đây. HTTP `http://localhost:8080` chuyển sang HTTPS.

Kiểm tự động (Node xác minh TLS bằng CA local):

```powershell
$env:BASE_URL = 'https://localhost:8443'
$env:HTTP_URL = 'http://localhost:8080'
$env:NODE_EXTRA_CA_CERTS = Join-Path $tlsRoot 'ca/root-ca.pem'
node apps/api/test/smoke/prod-stack.mjs
```

Playwright riêng cho stack đã chạy, không tự bật dev server:

```powershell
$env:PING_LOCAL_CERTIFICATE = Join-Path $tlsRoot 'server/fullchain.pem'
pnpm --filter web exec playwright test --config playwright.local.config.ts
```

Chromium của bài test chỉ chấp nhận thêm khóa của chứng chỉ server đã chỉ định; nó không cài CA
vào Windows. Bài test không chứng minh trình duyệt cá nhân đã tin CA. Node/APIRequestContext vẫn
xác minh chuỗi chứng chỉ với `NODE_EXTRA_CA_CERTS`; không đặt `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 4. Xem log, dừng và chạy lại

```powershell
docker compose @dc logs --tail 80 api nginx
docker compose @dc stop
docker compose @dc up -d --no-build --wait
```

`stop` giữ container và dữ liệu; `down` dọn container/network nhưng giữ volume nếu không có `-v`.
Tránh `down -v`: nó xóa DB luyện tập. Sau khi khởi động lại máy, bật Docker Desktop rồi chạy lại
bước khởi tạo biến và `up`; các biến PowerShell không tự lưu giữa các phiên.

## 5. Backup và diễn tập khôi phục

Trước khi dump và so dữ liệu, dừng API để không phát sinh ghi trong khoảng đối chiếu. Tạo bản dump
trong container rồi `docker cp` ra máy; không đưa dump nhị phân qua toán tử `>` của PowerShell 5.1.

```powershell
$backupDir = Join-Path $deploymentRoot 'backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupFile = Join-Path $backupDir ('ping-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
docker compose @dc stop api
$dbContainer = (docker compose @dc ps -q postgres).Trim()
docker exec $dbContainer pg_dump -U ping -Fc -f /tmp/ping-backup.dump ping
if ($LASTEXITCODE -ne 0) { throw 'Backup thất bại' }
docker cp "${dbContainer}:/tmp/ping-backup.dump" $backupFile
if ($LASTEXITCODE -ne 0) { throw 'Không chép được backup ra máy' }
docker cp $backupFile "${dbContainer}:/tmp/ping-restore.dump"
if ($LASTEXITCODE -ne 0) { throw 'Không chép được backup vào container' }
$restoreDb = 'ping_restore_' + (Get-Date -Format 'yyyyMMddHHmmss')
docker exec $dbContainer createdb -U ping $restoreDb
if ($LASTEXITCODE -ne 0) { throw 'Không tạo được DB khôi phục mới' }
docker exec $dbContainer pg_restore -U ping -d $restoreDb --no-owner --exit-on-error /tmp/ping-restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Khôi phục thất bại' }
docker cp ops/restore-check.sql "${dbContainer}:/tmp/ping-restore-check.sql"
if ($LASTEXITCODE -ne 0) { throw 'Không chép được SQL đối chiếu' }
$sourceRows = @(docker exec $dbContainer psql -U ping -d ping -At -F ',' -f /tmp/ping-restore-check.sql)
if ($LASTEXITCODE -ne 0) { throw 'Không đọc được DB gốc' }
$restoredRows = @(docker exec $dbContainer psql -U ping -d $restoreDb -At -F ',' -f /tmp/ping-restore-check.sql)
if ($LASTEXITCODE -ne 0) { throw 'Không đọc được DB khôi phục' }
if (Compare-Object $sourceRows $restoredRows) { throw 'DB khôi phục chưa khớp DB gốc' }
Write-Output 'PASS: số hàng và fingerprint 10 bảng khớp, gồm migration'
docker compose @dc up -d --no-deps --no-build --wait api
```

DB gốc vẫn là `ping`. DB mới chỉ để kiểm restore, chưa chuyển ứng dụng sang đó. SQL đối chiếu dành
cho DB nhỏ local, so cả số hàng và fingerprint toàn bộ nội dung; không in dữ liệu nhạy cảm. Khi
xong và đã xác nhận đúng tên DB thử, có thể dọn **chính `$restoreDb` vừa tạo** bằng
`docker exec $dbContainer dropdb -U ping $restoreDb`. Giữ bản `.dump` bên ngoài container để tập restore.

Đây là backup thủ công cùng máy; lịch tự động, retention, mã hóa và bản sao ngoài máy chủ vẫn là
việc còn chờ của staging. Nếu một bước lỗi, giữ dump, điều tra và khởi động lại API khi an toàn.

## 6. Tập cập nhật và rollback bằng tag

Giữ tag `practice-a`. Với lần cập nhật mã thật, đặt tag mới, build và sao lưu trước migrate. Để tập
cơ chế chọn image khi chưa có thay đổi code, tạo `practice-b` từ cùng image hiện tại:

```powershell
docker image tag ping-local-api:practice-a ping-local-api:practice-b
docker image tag ping-local-web:practice-a ping-local-web:practice-b
$env:PING_RELEASE = 'practice-b'
docker compose @dc up -d --no-deps --no-build --pull never --wait api web
if ($LASTEXITCODE -ne 0) { throw 'Chưa chạy được practice-b' }
node apps/api/test/smoke/prod-stack.mjs
# Quay lại image đã lưu, không build, không chạy migrate:
$env:PING_RELEASE = 'practice-a'
docker compose @dc up -d --no-deps --no-build --pull never --wait api web
if ($LASTEXITCODE -ne 0) { throw 'Rollback thất bại' }
node apps/api/test/smoke/prod-stack.mjs
Remove-Item Env:PING_RELEASE
```

`--no-deps` tránh khởi động migration trong lúc rollback. Hai tag luyện tập trỏ cùng mã nguồn:
bài này kiểm cơ chế chọn image và phục hồi dịch vụ, chưa chứng minh tương thích hai phiên bản
code/schema khác nhau. Với bản thật, cần image cũ đã giữ và migration expand/contract; xem
[migration](migrations.md), [rollback](rollback.md). Chưa có registry hoặc tự động deploy cloud.

## 7. Gia hạn localhost

```powershell
node scripts/local-certificates.mjs $tlsRoot --renew
if ($LASTEXITCODE -ne 0) { throw 'Gia hạn thất bại' }
docker compose @dc exec -T nginx nginx -t
if ($LASTEXITCODE -ne 0) { throw 'Chứng chỉ/cấu hình chưa hợp lệ' }
docker compose @dc exec -T nginx nginx -s reload
```

CA giữ nguyên nên không cần tin lại khi chỉ gia hạn leaf. CA hết hạn hoặc thiếu một nửa cặp file
thì script từ chối tự thay; cần xem lại CA và bước tin cậy. Firefox hoặc trình duyệt cấu hình riêng
có thể cần cách tin CA riêng. Nơi triển khai thật phải quản lý chứng chỉ công khai và gia hạn tự động.

## 8. Khi chuyển sang máy mới

Tạo CA mới trên máy mới, khôi phục DB vào volume riêng từ dump đã bảo vệ, cung cấp env tương ứng,
build web đúng origin rồi kiểm tra lại. Không gửi khóa CA qua Git hoặc coi chứng chỉ localhost là
chứng chỉ cho domain thật. Phần DNS/firewall, giám sát, backup tự động và diễn tập staging sẽ bổ sung
sau khi chọn môi trường đó.
