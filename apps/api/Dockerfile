# syntax=docker/dockerfile:1
# Build từ GỐC repo:  docker build -f apps/api/Dockerfile --target runner -t ping-api .
# Ba đích: `runner` (chạy API), `migrate` (chạy prisma migrate deploy, ADR-0032).
ARG NODE_VERSION=24.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
WORKDIR /repo

# 1. Chỉ giữ phần của api và những gói nó phụ thuộc (shared, tsconfig, eslint-config).
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.9 prune api --docker

# 2. Cài dependency trước (layer này được cache khi chỉ code đổi), rồi build.
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
# `prisma generate` đọc prisma7.config.ts nên cần DATABASE_URL tồn tại, dù không kết nối: truyền giá trị giả
# chỉ cho lệnh này (không lưu vào image).
RUN pnpm --filter @ping/shared build && \
    DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter api build

# Đích migrate: cần prisma CLI (devDependency) nên dùng luôn stage build. Chạy MỘT LẦN mỗi lần deploy,
# trước khi rollout API; instance API không tự migrate lúc khởi động (quy tắc 13).
FROM build AS migrate
USER node
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# 3. Chỉ production dependency + code đã build.
FROM build AS pruned
RUN pnpm --filter api deploy --legacy --prod /out

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=pruned --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
