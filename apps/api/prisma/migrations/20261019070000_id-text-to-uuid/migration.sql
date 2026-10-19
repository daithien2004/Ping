-- Đổi mọi id/khóa ngoại từ TEXT sang UUID gốc của Postgres (16 byte thay vì 36+,
-- index nhỏ hơn, DB tự từ chối giá trị không phải UUID). Xem ADR-0005.
-- Viết tay: `prisma migrate diff` sinh DROP COLUMN + ADD COLUMN, làm mất dữ liệu.
-- ALTER ... TYPE ... USING giữ nguyên dữ liệu; PK, unique và index tự build lại.

-- 1. Gỡ khóa ngoại: hai đầu FK phải cùng kiểu trong suốt quá trình đổi.
ALTER TABLE "Session"    DROP CONSTRAINT "Session_userId_fkey";
ALTER TABLE "Server"     DROP CONSTRAINT "Server_ownerId_fkey";
ALTER TABLE "Role"       DROP CONSTRAINT "Role_serverId_fkey";
ALTER TABLE "Member"     DROP CONSTRAINT "Member_serverId_fkey";
ALTER TABLE "Member"     DROP CONSTRAINT "Member_userId_fkey";
ALTER TABLE "MemberRole" DROP CONSTRAINT "MemberRole_memberId_fkey";
ALTER TABLE "MemberRole" DROP CONSTRAINT "MemberRole_roleId_fkey";
ALTER TABLE "Channel"    DROP CONSTRAINT "Channel_serverId_fkey";
ALTER TABLE "Message"    DROP CONSTRAINT "Message_channelId_fkey";
ALTER TABLE "Message"    DROP CONSTRAINT "Message_authorId_fkey";

-- 2. Đổi kiểu cột.
ALTER TABLE "User"       ALTER COLUMN "id"        TYPE UUID USING "id"::uuid;
ALTER TABLE "Session"    ALTER COLUMN "id"        TYPE UUID USING "id"::uuid,
                         ALTER COLUMN "userId"    TYPE UUID USING "userId"::uuid;
ALTER TABLE "Server"     ALTER COLUMN "id"        TYPE UUID USING "id"::uuid,
                         ALTER COLUMN "ownerId"   TYPE UUID USING "ownerId"::uuid;
ALTER TABLE "Role"       ALTER COLUMN "id"        TYPE UUID USING "id"::uuid,
                         ALTER COLUMN "serverId"  TYPE UUID USING "serverId"::uuid;
ALTER TABLE "Member"     ALTER COLUMN "id"        TYPE UUID USING "id"::uuid,
                         ALTER COLUMN "serverId"  TYPE UUID USING "serverId"::uuid,
                         ALTER COLUMN "userId"    TYPE UUID USING "userId"::uuid;
ALTER TABLE "MemberRole" ALTER COLUMN "memberId"  TYPE UUID USING "memberId"::uuid,
                         ALTER COLUMN "roleId"    TYPE UUID USING "roleId"::uuid;
ALTER TABLE "Channel"    ALTER COLUMN "id"        TYPE UUID USING "id"::uuid,
                         ALTER COLUMN "serverId"  TYPE UUID USING "serverId"::uuid;
ALTER TABLE "Message"    ALTER COLUMN "id"        TYPE UUID USING "id"::uuid,
                         ALTER COLUMN "channelId" TYPE UUID USING "channelId"::uuid,
                         ALTER COLUMN "authorId"  TYPE UUID USING "authorId"::uuid;

-- 3. Gắn lại khóa ngoại, giữ nguyên hành vi onDelete như migration init.
ALTER TABLE "Session"    ADD CONSTRAINT "Session_userId_fkey"      FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Server"     ADD CONSTRAINT "Server_ownerId_fkey"      FOREIGN KEY ("ownerId")   REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Role"       ADD CONSTRAINT "Role_serverId_fkey"       FOREIGN KEY ("serverId")  REFERENCES "Server"("id")  ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Member"     ADD CONSTRAINT "Member_serverId_fkey"     FOREIGN KEY ("serverId")  REFERENCES "Server"("id")  ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Member"     ADD CONSTRAINT "Member_userId_fkey"       FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_memberId_fkey" FOREIGN KEY ("memberId")  REFERENCES "Member"("id")  ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_roleId_fkey"   FOREIGN KEY ("roleId")    REFERENCES "Role"("id")    ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Channel"    ADD CONSTRAINT "Channel_serverId_fkey"    FOREIGN KEY ("serverId")  REFERENCES "Server"("id")  ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Message"    ADD CONSTRAINT "Message_channelId_fkey"   FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Message"    ADD CONSTRAINT "Message_authorId_fkey"    FOREIGN KEY ("authorId")  REFERENCES "User"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
