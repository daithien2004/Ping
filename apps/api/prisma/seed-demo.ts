/**
 * Seed demo tiếng Việt (T4.7): ≥ 3 server, ≥ 20.000 tin có chủ đề rõ ràng, chạy lặp lại cho
 * KẾT QUẢ NHƯ NHAU (id cố định, RNG seed cố định, thời điểm cố định — không Date.now).
 * Ghi thẳng DB; KHÔNG chứa dữ liệu người dùng thật.
 *
 *   pnpm seed:demo
 *   (hoặc) pnpm --filter api exec tsx prisma/seed-demo.ts
 *
 * Dùng chung tài khoản seed dev (alice/bob/carol) + thêm david@ping.dev. Mọi id demo nằm
 * trong dải `019b0000-…` (12 ký tự hex cuối do hàm `demoId` dựng) — không đụng dải seed dev
 * (`0199…`) nên chạy song song an toàn; upsert theo id nên chạy lại bao nhiêu lần cũng cho
 * cùng trạng thái. Thứ tự id trong một kênh tăng theo chỉ số tin = thứ tự thời gian, khớp
 * hành vi cursor phân trang.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Chạy trực tiếp qua tsx (không qua Prisma CLI) nên tự nạp .env gốc của repo.
const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
process.loadEnvFile(path.join(repoRoot, '.env'));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — seed cần env này để kết nối Postgres.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const PASSWORD = 'password123';
const ID_BASE = '019b0000-0000-7000-8000-'; // 24 ký tự đầu; phần cuối 12 hex do demoId dựng
const EPOCH_MS = Date.UTC(2026, 8, 1); // 2026-09-01T00:00:00Z — thời điểm tin đầu
const STEP_MS = 47_000; // bước đều giữa hai tin liên tiếp
const MESSAGES_PER_CHANNEL = 2_400;

/** Ghép 12 ký tự hex cuối: các đoạn pad đúng để tổng luôn 12 (UUID hợp lệ, duy nhất). */
function demoId(...parts: Array<string | number>): string {
  const joined = parts.join('');
  if (joined.length > 12 || !/^[0-9a-f]+$/.test(joined)) {
    throw new Error(`demoId parts must form 12 hex chars, got "${joined}" (${joined.length})`);
  }
  return ID_BASE + joined.padStart(12, '0');
}

/** mulberry32 — PRNG nhỏ, cùng seed cho cùng dãy (dữ liệu demo lặp lại như nhau). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;

// ── Dữ liệu demo ────────────────────────────────────────────────────────
// user index: 1=alice, 2=bob, 3=carol, 4=david; server index: 1..3; channel index: 1..3.
const USERS = [
  { n: 1, email: 'alice@ping.dev', username: 'alice', displayName: 'Alice Nguyen' },
  { n: 2, email: 'bob@ping.dev', username: 'bob', displayName: 'Bob Tran' },
  { n: 3, email: 'carol@ping.dev', username: 'carol', displayName: 'Carol Le' },
  { n: 4, email: 'david@ping.dev', username: 'david', displayName: 'David Pham' },
] as const;
const ALICE = 1;

const SERVERS = [
  {
    n: 1,
    name: 'Ping Coffee',
    inviteCode: 'demo-coffee',
    channels: [
      {
        n: 1,
        name: 'pha-che',
        topics: [
          'hạt Ethiopia rang mùi vừa hôm nay thơm hẳn lên',
          'tỷ lệ nước với cà phê một trên mười lăm cho pour over là vừa miệng nhất',
          'máy xay trục song song ổn định hơn lưỡi dao nhiều, hạt đều hơn hẳn',
          'cold brew ngâm mười tám giờ vị dịu, ít chua hơn ngâm mười hai giờ',
          'espresso hôm nay chiết hai mươi lăm giây, lớp kem đẹp đấy',
          'vẽ hình trên cà phê sữa hôm nay ra hình tim đều tay hơn mọi ngày',
        ],
      },
      {
        n: 2,
        name: 'phuc-vu',
        topics: [
          'khách đông nhất khung tám giờ sáng, nên xếp thêm người ca sớm',
          'mục mới bán chạy nhất là cà phê muối đá',
          'phản hồi của khách về bánh sừng bò đều tốt',
          'chương trình thẻ tích điểm tháng này tăng hai mươi phần trăm khách quay lại',
          'nên mở cửa sổ đặt hàng trực tuyến để giảm xếp hàng giờ tan tầm',
          'nhân viên mới hôm nay phục vụ đã tay hơn hẳn tuần trước',
        ],
      },
      {
        n: 3,
        name: 'hanh-trinh',
        topics: [
          'chuyến đi Đà Lạt thăm nông trại hạt rất thú vị',
          'gặp được bà chủ vườn ba mươi năm tuổi, nghe chuyện thu mua công bằng',
          'quy trình rang nhỏ theo lô giữ được hương vị vùng nguyên liệu',
          'nếm thử sáu loại hạt, loại Kenya sáng vị nhất',
          'kế hoạch mở chi nhánh thứ hai đang tính vị trí khu văn phòng',
          'hình ảnh chuyến đi đăng lên mạng xã hội nhiều người thích',
        ],
      },
    ],
  },
  {
    n: 2,
    name: 'Ping Dev Team',
    inviteCode: 'demo-dev',
    channels: [
      {
        n: 1,
        name: 'general',
        topics: [
          'họp tuần vào thứ ba, chuẩn bị danh sách việc cần chốt',
          'bản dựng mới đã lên môi trường thử nghiệm cho mọi người xem',
          'lỗi đăng nhập đã sửa, chờ người xem xét mã rồi gộp',
          'tài liệu kiến trúc vừa cập nhật thêm sơ đồ luồng tin nhắn',
          'kỳ này ưu tiên hiệu năng danh sách tin nhắn trước đã',
          'ai rảnh hỗ trợ xem xét một yêu cầu gộp mã nhỏ với',
        ],
      },
      {
        n: 2,
        name: 'thiet-ke',
        topics: [
          'bảng màu tối xem buổi chiều dễ chịu hơn hẳn',
          'kích thước bo góc thống nhất mười hai pixel theo bảng token',
          'biểu tượng mới thẳng hàng với dòng chữ trong danh sách kênh',
          'trạng thái rỗng nên luôn gợi ý một hành động cho người dùng',
          'chuyển động giới hạn hai trăm mili giây cho đỡ rối mắt',
          'nhãn nút nên là động từ: gửi, lưu, xóa chứ không phải danh từ',
        ],
      },
      {
        n: 3,
        name: 'trien-khai',
        topics: [
          'đường ống dựng đã xanh trên bản chính, chuẩn bị phát hành',
          'sao lưu tối nay chạy đúng lịch, khôi phục thử thành công',
          'cảnh báo hết hạn chứng chỉ gửi về kênh vận hành trước mười bốn ngày',
          'chỉ số độ trễ p95 giảm sau khi gộp sự kiện hiện diện',
          'mã nguồn chính đã khóa nhánh phát hành, mọi người cẩn thận gộp',
          'kế hoạch mở rộng máy chủ ghi trong tài liệu ngân sách',
        ],
      },
    ],
  },
  {
    n: 3,
    name: 'Ping Hobby',
    inviteCode: 'demo-hobby',
    channels: [
      {
        n: 1,
        name: 'game',
        topics: [
          'tối nay lập nhóm chơi năm đấu năm, ai vào thì điểm danh dưới đây',
          'bản cập nhật mới chỉnh cân bằng nhân vật rõ ràng hẳn',
          'kỷ lục cá nhân vừa phá được sau ba tuần luyện tập',
          'trò chơi chiến thuật mới đồ họa đẹp nhưng học chơi hơi lâu',
          'cuối tuần tổ chức giải nhỏ trong nhóm, có quà vui vẻ',
          'mẹo tiết kiệm tài nguyên trong game cho người mới bắt đầu',
        ],
      },
      {
        n: 2,
        name: 'phim-anh',
        topics: [
          'bộ phim tài liệu về núi cao quay đẹp khó tin',
          'kịch bản phần hai giữ được nhịp của phần một, đáng xem',
          'liên hoan điện ảnh năm nay nhiều tác phẩm quốc tế tham dự',
          'xem lại phim cổ điển bằng máy chiếu ở nhà là trải nghiệm khác',
          'ai thích thể loại trinh thám thì bộ này đáng một buổi',
          'âm nhạc phim do dàn giao hưởng thu, nghe rất đã tai',
        ],
      },
      {
        n: 3,
        name: 'the-thao',
        topics: [
          'sáng nay chạy bộ năm cây số, thời gian tốt hơn tuần trước',
          'lớp yoga mới ở công viên mở buổi miễn phí cuối tuần',
          'đội bóng nhỏ của khu dân cư thắng trận đầu tiên trong mùa',
          'đôi giày chạy mới nhẹ hơn hẳn, nhưng cần vài tuần làm quen',
          'kế hoạch tập ba mươi ngày có người đồng hành dễ giữ nhịp hơn',
          'hồ bơi trong trường sửa xong, mở cửa buổi tối cho dân quanh vùng',
        ],
      },
    ],
  },
] as const;

async function main(): Promise<void> {
  const passwordHash = await hash(PASSWORD, { type: argon2id });

  // ── Users (chia sẻ với seed dev bằng upsert theo email) ───────────────
  // alice/bob/carol có thể đã tồn tại từ seed dev với id `0199…` — upsert không đổi id.
  // Lấy lại id THẬT sau upsert để mọi khóa ngoại (server/member/message) dùng đúng id đó.
  const userIdOf = new Map<number, string>();
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        id: demoId('1', user.n),
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        passwordHash,
      },
    });
    const actual = await prisma.user.findUniqueOrThrow({
      where: { email: user.email },
      select: { id: true },
    });
    userIdOf.set(user.n, actual.id);
  }
  const everyonePermissions = 1027n; // VIEW_CHANNEL | SEND_MESSAGES | ADD_REACTIONS (TG.2)

  for (const server of SERVERS) {
    const serverId = demoId('2', server.n);
    await prisma.server.upsert({
      where: { id: serverId },
      update: {},
      create: {
        id: serverId,
        name: server.name,
        ownerId: userIdOf.get(ALICE)!,
        inviteCode: server.inviteCode,
      },
    });

    // Role @everyone + member cho cả 4 người dùng.
    const everyoneRoleId = demoId('3', server.n);
    await prisma.role.upsert({
      where: { id: everyoneRoleId },
      update: {},
      create: {
        id: everyoneRoleId,
        serverId,
        name: '@everyone',
        isDefault: true,
        permissions: everyonePermissions,
        position: 0,
      },
    });
    for (const user of USERS) {
      await prisma.member.upsert({
        where: { serverId_userId: { serverId, userId: userIdOf.get(user.n)! } },
        update: {},
        create: {
          id: demoId('4', server.n, user.n),
          serverId,
          userId: userIdOf.get(user.n)!,
          roles: { create: { roleId: everyoneRoleId } },
        },
      });
    }
    const aliceMember = await prisma.member.findUniqueOrThrow({
      where: { serverId_userId: { serverId, userId: userIdOf.get(ALICE)! } },
      select: { id: true },
    });
    const aliceMemberId = aliceMember.id;

    // ── Tin nhắn theo chủ đề ────────────────────────────────────────────
    // Mỗi kênh MESSAGES_PER_CHANNEL tin; thời điểm tăng đều từ EPOCH; tác giả và câu chọn
    // bằng PRNG seed cố định → chạy lại cho cùng nội dung, cùng thứ tự. Mỗi 60 tin một tin
    // nhắc alice để demo badge mention có dữ liệu.
    let messageIndex = 0;
    for (const channel of server.channels) {
      const channelId = demoId('5', server.n, channel.n);
      await prisma.channel.upsert({
        where: { id: channelId },
        update: {},
        create: { id: channelId, serverId, name: channel.name, position: channel.n - 1 },
      });

      for (let i = 0; i < MESSAGES_PER_CHANNEL; i += 1) {
        const author = USERS[Math.floor(rng() * USERS.length)]!;
        const topic = pick(channel.topics);
        const isMention = messageIndex % 60 === 0;
        const content = isMention ? `@alice ${topic} nhé` : topic;
        const messageId = demoId('6', server.n, channel.n, i.toString(16).padStart(4, '0'));
        await prisma.message.upsert({
          where: { id: messageId },
          update: {},
          create: {
            id: messageId,
            channelId,
            authorId: userIdOf.get(author.n)!,
            content,
            createdAt: new Date(EPOCH_MS + messageIndex * STEP_MS),
          },
        });
        if (isMention) {
          // Mention có id tường minh (compound unique chứa cột NULL nên không upsert theo
          // khóa đó được — Prisma không nhận null trong where của compound unique).
          await prisma.messageMention.upsert({
            where: { id: demoId('7', server.n, channel.n, i.toString(16).padStart(4, '0')) },
            update: {},
            create: {
              id: demoId('7', server.n, channel.n, i.toString(16).padStart(4, '0')),
              messageId,
              kind: 'user',
              mentionedMemberId: aliceMemberId,
            },
          });
        }
        messageIndex += 1;
      }
    }
  }

  // UUID không dùng được startsWith — đếm theo khoảng id của dải demo (gte/lte như cursor).
  const demoRange = { gte: `${ID_BASE}000000000000`, lte: `${ID_BASE}ffffffffffff` };
  const [servers, channels, messages, mentions] = await Promise.all([
    prisma.server.count({ where: { id: demoRange } }),
    prisma.channel.count({ where: { id: demoRange } }),
    prisma.message.count({ where: { id: demoRange } }),
    prisma.messageMention.count({ where: { message: { id: demoRange } } }),
  ]);
  console.log(
    `seed-demo: servers=${servers} channels=${channels} messages=${messages} mentions=${mentions}`,
  );
  console.log(
    'Tài khoản demo dùng chung mật khẩu password123 (alice/bob/carol@ping.dev, david@ping.dev).',
  );
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
