/**
 * Đo p95 TRUY VẤN tìm kiếm (T4.6, ADR-0045) trên tập 20.000 tin tiếng Việt trong DB dev
 * (server riêng, dọn sau). Đo ở lớp SQL — đúng câu lệnh service dựng (WHERE/GIN như lúc
 * chạy qua HTTP); overhead HTTP/guard không thuộc "p95 truy vấn". Chạy:
 *   pnpm --filter api exec tsx test/search/measure.ts
 */
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
process.loadEnvFile(path.join(repoRoot, '.env'));

const MESSAGES = Number(process.env.SEARCH_MEASURE_MESSAGES ?? 20_000);
const RUNS = Number(process.env.SEARCH_MEASURE_RUNS ?? 200);

const CORPUS = [
  'họp nhóm lúc 9 giờ sáng mai ở phòng lớn',
  'mình đã gửi báo cáo tuần qua cho mọi người rồi',
  'ai chịu trách nhiệm phần thư viện API nhỉ',
  'kế hoạch quý tới cần chốt danh sách ưu tiên',
  'bug đăng nhập đã sửa xong, chờ deploy',
  'chi phí hạ tầng tháng này ổn hơn dự kiến',
  'cần thêm người review pull request của nhóm phụ trợ',
  'tài liệu kiến trúc đã cập nhật sơ đồ mới',
  'cuộc họp khách hàng lùi sang thứ năm',
  'nhớ viết test cho luồng đăng ký nhé',
  'server đang chậm lại, kiểm tra pool kết nối giúp',
  'bản demo tiếng Việt nhìn ổn đấy',
  'phần tìm kiếm phải tôn trọng quyền truy cập',
  'log có đầy đủ mã yêu cầu để đối chiếu',
  'anh em ai rảnh hỗ trợ khảo sát trải nghiệm',
  'số liệu hiệu năng gửi kèm báo cáo đính kèm',
  'đào tạo thành viên mới vào thứ ba',
  'cảnh báo chứng chỉ sắp hết hạn cần gia hạn',
  'sao lưu dữ liệu đêm qua thành công',
  'ghi chú họp: mỗi người một hành động trước thứ sáu',
];

const SEARCH_SQL = `
  SELECT m.id, m.content, m."createdAt"
  FROM "Message" m
  JOIN "Channel" c ON c.id = m."channelId"
  WHERE c."serverId" = $1::uuid
    AND m."deletedAt" IS NULL
    AND (
      m.search @@ websearch_to_tsquery('simple', public.f_unaccent($2))
      OR public.f_unaccent(m.content) ILIKE ('%' || public.f_unaccent($2) || '%')
    )
  ORDER BY m.id DESC
  LIMIT 26`;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const suffix = randomUUID().slice(0, 8);
  const passwordHash = await hash('password123', { type: 2 });
  const userId = (
    await client.query(
      `INSERT INTO "User" (id, email, username, "displayName", "passwordHash", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'Measure', $3, now()) RETURNING id`,
      [`measure-${suffix}@ping.dev`, `measure${suffix}`.slice(0, 32), passwordHash],
    )
  ).rows[0].id;
  const serverId = (
    await client.query(
      `INSERT INTO "Server" (id, name, "ownerId", "inviteCode")
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [`Measure ${suffix}`, userId, randomUUID().slice(0, 8)],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO "Role" (id, "serverId", name, permissions, position, "isDefault")
     VALUES (gen_random_uuid(), $1, '@everyone', 3, 0, true)`,
    [serverId],
  );
  const member = (
    await client.query(
      `INSERT INTO "Member" (id, "serverId", "userId") VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
      [serverId, userId],
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO "MemberRole" ("memberId", "roleId")
     SELECT $1, id FROM "Role" WHERE "serverId" = $2 AND "isDefault"`,
    [member, serverId],
  );
  const channels: string[] = [];
  for (const [index, name] of ['general', 'kho-tai-lieu'].entries()) {
    const row = await client.query(
      `INSERT INTO "Channel" (id, "serverId", name, position)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [serverId, name, index],
    );
    channels.push(row.rows[0].id);
  }

  // Seed theo lô, nội dung xoay vòng corpus, thời điểm trải đều 90 ngày qua hai kênh.
  const BATCH = 2_000;
  const seeded = Date.now();
  for (let offset = 0; offset < MESSAGES; offset += BATCH) {
    const rows: string[] = [];
    const params: unknown[] = [];
    for (let i = offset; i < Math.min(offset + BATCH, MESSAGES); i += 1) {
      const base = params.length;
      rows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(
        randomUUID(),
        channels[i % channels.length]!,
        userId,
        `${CORPUS[i % CORPUS.length]!} #${i}`,
        new Date(seeded - (i * 77_760_000) / MESSAGES),
      );
    }
    await client.query(
      `INSERT INTO "Message" (id, "channelId", "authorId", content, "createdAt")
       VALUES ${rows.join(',')}`,
      params,
    );
  }
  const count = (
    await client.query(`SELECT count(*)::int FROM "Message" WHERE "channelId" = ANY($1)`, [
      channels,
    ])
  ).rows[0].count as number;
  console.log(`seed=${count} messages, runs=${RUNS} per query`);

  const percentile = (sorted: number[], p: number) =>
    sorted[Math.floor((p / 100) * sorted.length)]!;
  async function measure(label: string, q: string) {
    const times: number[] = [];
    let rows = -1;
    for (let i = 0; i < RUNS; i += 1) {
      const started = performance.now();
      const res = await client.query(SEARCH_SQL, [serverId, q]);
      times.push(performance.now() - started);
      rows = res.rowCount ?? -1;
    }
    const sorted = [...times].sort((a, b) => a - b);
    console.log(
      `${label}: kết_quả=${rows} p50=${percentile(sorted, 50).toFixed(2)}ms p95=${percentile(sorted, 95).toFixed(2)}ms p99=${percentile(sorted, 99).toFixed(2)}ms`,
    );
  }

  await measure('FTS+unaccent (từ có dấu)', 'báo cáo');
  await measure('FTS (cụm 2 từ)', 'họp nhóm');
  await measure('Trigram (con chuỗi trong từ)', 'áo c');
  await measure('FTS từ hiếm', 'không_tồn_tại_xyz');

  await client.query(`DELETE FROM "Message" WHERE "channelId" = ANY($1)`, [channels]);
  await client.query(`DELETE FROM "Server" WHERE id = $1`, [serverId]);
  await client.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  await client.end();
  console.log('cleanup done');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
