-- Lookup refresh token theo hash phải O(log n) — mỗi request /refresh tra bảng Session.
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
