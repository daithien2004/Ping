// Đọc các báo cáo Lighthouse CI trong .lighthouseci/ và in các kiểm tra chưa đạt (cùng phần tử vi phạm) dưới dạng
// annotation của GitHub Actions. Log đầy đủ của job cần đăng nhập mới đọc được; annotation thì xem công khai được.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dir = '.lighthouseci';
if (!existsSync(dir)) process.exit(0);

const seen = new Set();
for (const file of readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f))) {
  const lhr = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  for (const [category, data] of Object.entries(lhr.categories)) {
    if (data.score === null || data.score >= 0.95) continue;
    console.log(`::warning::lhci ${category} = ${data.score}`);
    for (const ref of data.auditRefs) {
      const audit = lhr.audits[ref.id];
      if (audit.scoreDisplayMode !== 'binary' && audit.scoreDisplayMode !== 'numeric') continue;
      if (audit.score === null || audit.score >= 0.9) continue;
      const key = `${category}:${ref.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const items = (audit.details?.items ?? [])
        .slice(0, 3)
        .map((item) => item.node?.selector ?? item.url ?? item.description ?? '')
        .filter(Boolean)
        .join(' ; ');
      const explanation = (audit.explanation ?? audit.displayValue ?? '')
        .replace(/\s+/g, ' ')
        .slice(0, 160);
      console.log(
        `::warning::lhci ${category}/${ref.id} score=${audit.score} ${explanation} ${items}`,
      );
    }
  }
}
