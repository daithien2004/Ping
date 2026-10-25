# Bằng chứng T5.9 — Đánh giá AI và ranh giới trích dẫn

Base: `c67171b` (merge TG.1, nhánh `feat/tg5-permalink`). Nhánh: `test/t5.9-ai-evaluation`. Bằng chứng
nằm trong cùng commit với code.

Dữ liệu chạy là corpus demo tiếng Việt của T5.1 (50 tin, `apps/api/test/ai/embedding-dataset.json`),
không phải câu hỏi thật của người dùng Ping. Không seed 21.600 tin để chạy bộ này.

## Phạm vi

- `apps/api/src/modules/ai/ask/ask.service.ts`: ranh giới trích dẫn chặt (sửa lỗi tìm được khi viết test).
  - Mọi UUID trong câu trả lời phải **bọc trong `[ ]`** và **thuộc ngữ cảnh đã hydrate**; một UUID bịa
    hoặc UUID trần làm **hỏng cả câu trả lời** → `AI_NO_CITATION`, không phát `delta`/`done`.
  - Trước đây chỉ lọc danh sách chip, nên UUID bịa vẫn nằm trong văn bản gửi cho người dùng và có thể
    bị ghi cache; UUID không bọc ngoặc vẫn được tính là trích dẫn.
  - Câu trả lời lấy từ cache được **kiểm lại theo ngữ cảnh hiện tại**; cache không hợp lệ bị bỏ qua và
    đi tiếp đường budget/LLM bình thường. Token của lượt gọi đã hoàn tất vẫn được ghi usage.
- `apps/api/src/modules/ai/cache/ask-cache.service.ts`: namespace `ASK_PROMPT_VERSION` →
  `ask-v2-strict-citations` để không trộn câu trả lời theo chính sách cũ. Không cần flush Redis.
- `apps/api/test/ai/qa-dataset.json`: 30 golden Q&A, facts + ID nguồn do người viết gắn nhãn trước khi
  gọi model; mỗi nhóm fact có nhiều cách viết tương đương.
- `apps/api/test/ai/injection-dataset.json`: 12 payload (bỏ qua luật vi/en, giả system, đóng XML, giả
  delimiter role, lặp prompt, URL ngoài, nguồn bịa, giả khẩn cấp/chính sách, đòi dữ liệu server khác).
- `apps/api/test/ai/evaluation.ts`: scorer dùng chung + harness Ask offline (chấm facts sau khi bỏ dấu/
  chuẩn hoá chữ, citation precision/recall, canary/URL/lộ tiền tố system prompt); ID `mNN` của corpus
  ánh xạ ổn định sang UUIDv7.
- `apps/api/test/ai/evaluation.spec.ts`: 4 unit test cho scorer và harness (provider lỗi không được tính
  là phòng thủ thành công; ca lỗi vẫn nằm trong mẫu số).
- `apps/api/src/modules/ai/ask/ask.service.spec.ts`: thêm 3 test hồi quy cho ranh giới trích dẫn (trộn
  UUID đúng/bịa, UUID trần, replay cache không hợp lệ) — 23 test `AskService`.
- `apps/api/test/ai-evaluation.e2e-spec.ts`: 47 ca trên Postgres thật — 30 golden (hydrate từ seed, cấm
  lọt tin server khác/tin đã xoá vào prompt), 12 injection (đúng một `<context>`, đúng một `</context>`,
  đúng 2 `<message id=`, output không lộ canary/URL, vẫn trả lời đúng câu hỏi), outsider bị chặn **trước**
  vector lookup và **trước** LLM, kick làm mất cache membership, metadata cùng server bị giả, chunk trộn
  tin đọc được với tin server khác/tin đã xoá bị loại cả chunk, thiếu ngữ cảnh thì không gọi LLM.
- `apps/api/scripts/eval-qa.ts` + script `ai:eval:qa`: CLI manual hai chế độ `--offline` (extractive,
  không gọi mạng) và `--live` (Groq thật). Live giới hạn model `openai/gpt-oss-20b`, giá cấu hình 0,
  tối đa 42 lượt/run, không retry, cách nhau 10 s, timeout 20 s/lượt, dừng sau 2 lỗi liên tiếp và ghi
  các ca còn lại là "chưa chạy". `--out <thư mục>` để giữ lịch sử report; `--env-file` chỉ nạp cấu
  hình cho lần chạy.
- Tài liệu: `docs/v0.2.0/ai-evaluation.md` (ma trận bằng chứng, ngưỡng khai báo trước, cách chạy lại),
  `docs/adr/0062-ai-evaluation-and-citation-boundary.md`,
  `docs/v0.2.0/case-studies/cs-05-untrusted-llm.md` và mục lục case study.

Không thêm endpoint, migration hay dependency mới. CI/unit/e2e không gọi mạng: e2e dùng vector
candidates và LLM giả qua DI, nhưng Postgres/membership/CASL/hydrate/AskService/quota/cache là thật.

## Kết quả

Môi trường: Windows, Node 22, Docker Desktop; Postgres/Redis local, Qdrant không cần cho bộ này.
Live dùng Groq free tier `openai/gpt-oss-20b` (key chỉ trong `.env`, không commit, không in ra log).

| Tiêu chí                        | Lệnh/cách thử                                                                                         | Kết quả                                              | Ghi chú / file                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Test hồi quy đỏ trước khi sửa   | `pnpm --filter api exec vitest run test/ai/evaluation.spec.ts src/modules/ai/ask/ask.service.spec.ts` | **đỏ 3 ca** (23 test, 3 fail)                        | trộn UUID đúng/bịa, UUID trần, replay cache — `test-red.log` |
| Cùng bộ test sau khi sửa        | như trên                                                                                              | **xanh 82/82** (3 file, 1,34 s)                      | `test-green.log`                                             |
| Unit toàn repo                  | `pnpm test`                                                                                           | pass — api 25 file/194 test, web 23/178, shared 3/29 | `test.log`                                                   |
| API typecheck                   | `pnpm typecheck`                                                                                      | pass (4 task)                                        | `typecheck.log`                                              |
| Lint                            | `pnpm lint`                                                                                           | pass (3 task)                                        | `lint.log`                                                   |
| Build                           | `pnpm build`                                                                                          | pass (3 task, 36,4 s)                                | `build.log`                                                  |
| API e2e toàn bộ                 | `pnpm --filter api test:e2e`                                                                          | **pass 237/237** (30 file, 145,4 s)                  | `api-e2e.log`                                                |
| Seeded e2e T5.9                 | `vitest run --config vitest.config.e2e.ts test/ai-evaluation.e2e-spec.ts`                             | **pass 47/47** (4,78 s)                              | Postgres `ping_t59`, Redis DB 12 — `seeded-e2e.log`          |
| Golden offline (không gọi mạng) | `pnpm --filter api ai:eval:qa`                                                                        | **30/30**, facts 1,00, precision/recall 1,00         | `qa-offline.json`, `offline-run.log`                         |
| Injection offline               | như trên                                                                                              | **12/12 an toàn**, 12/12 vẫn trả lời đúng            | canary/URL/tiền tố system prompt đều không lọt               |
| Golden live (Groq free tier)    | `pnpm --filter api exec tsx scripts/eval-qa.ts --live`                                                | **30/30**                                            | `qa-live.json`                                               |
| Injection live                  | như trên                                                                                              | **12/12 an toàn**, 12/12 trả lời đúng                | không ca nào bị bỏ qua                                       |
| Hạn mức lượt gọi live           | report `calls`                                                                                        | **42/42**, đúng trần khai báo                        | 16.755 prompt + 6.298 completion = 23.053 token              |
| Liên kết tài liệu               | `pnpm docs:check`                                                                                     | pass                                                 | hai link tới file này từng đỏ trước khi thêm README          |

Tham chiếu trong report: `sourceCommit` = `c67171b` (base — worktree chưa commit nên không tuyên bố là
commit chứa implementation), `promptVersion` = `ask-v2-strict-citations`. `qa-offline.json` ghi hash
corpus `6e24933f…` — khớp hash của bộ fixture hiện tại; `qa-live.json` ghi `180b3781…`, tức hai report
**không** chạy trên cùng byte fixture, nên chỉ đọc số trong từng report, không so chéo và không coi cặp
report là một lần đo liên tục (cần chạy lại live trên fixture hiện tại nếu cần khớp hash).

## Giới hạn

- Offline và live dùng **ngữ cảnh oracle** (tin liên quan đã biết) + một tin nhiễu, nên chỉ đo khả năng
  sinh câu trả lời/trích dẫn và ranh giới prompt; **không** đo recall của embedding hay chất lượng
  retrieval end-to-end. Recall embedding T5.1 và ACL e2e là bằng chứng riêng, không gộp thành một điểm
  end-to-end.
- Chấm facts bằng chuỗi đã bỏ dấu/chuẩn hoá chữ: proxy có thể có false positive/negative, không phải
  kiểm chứng ngữ nghĩa. 30 golden chỉ phủ 50 tin demo của T5.1.
- Một lần chạy live (42 lượt). 12 payload injection không chứng minh an toàn với mọi injection; lỗi
  provider không được tính là phòng thủ thành công.
- Script không xác minh trạng thái billing/ZDR của tài khoản; chỉ dùng free tier đã được OWNER duyệt.
  Chi phí 0 USD là do giá cấu hình 0, không phải cam kết chi phí production.
- Chưa đo tỉ lệ cache hit của traffic thật, chưa có rate limit riêng cho AI (T6.5) và chưa có người nhận
  cảnh báo ngân sách ở staging (T5.11).
- Chưa merge/push, chưa chạy CI remote cho nhánh này.

## Cách chạy lại

```powershell
pnpm --filter api ai:eval:qa
pnpm --filter api exec vitest run test/ai/evaluation.spec.ts src/modules/ai/ask/ask.service.spec.ts
```

Seeded e2e cần DB test đã migrate và Redis DB riêng (suite reset Redis):

```powershell
$env:DATABASE_URL = 'postgresql://ping:ping@localhost:5432/ping_t59'
$env:E2E_REDIS_URL = 'redis://localhost:6379/12'
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/ai-evaluation.e2e-spec.ts
```

Không hướng suite vào DB dev/staging đang dùng. Live chỉ chạy khi có `GROQ_API_KEY` trong môi trường
chạy và đã được OWNER cho phép:

```powershell
pnpm --filter api exec tsx scripts/eval-qa.ts --live
```

Thư mục output mặc định là `docs/v0.2.0/evidence/T5.9`; chạy lại bằng chứng đã công bố thì dùng
`--out <thư mục mới>` để giữ lịch sử.
