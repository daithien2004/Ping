-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'MEMBER_ROLES_UPDATE', 'MESSAGE_DELETE', 'CHANNEL_DELETE', 'SERVER_DELETE');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetId" UUID,
    "metadata" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_serverId_id_idx" ON "AuditLog"("serverId", "id" DESC);

