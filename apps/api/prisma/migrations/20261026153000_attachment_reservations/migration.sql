ALTER TABLE "Attachment" ADD COLUMN "quotaBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rawRemoved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Attachment" SET "quotaBytes" = "sizeBytes" + 10485760 WHERE status NOT IN ('deleted', 'rejected');
ALTER TABLE "Attachment" ALTER COLUMN "quotaBytes" DROP DEFAULT;
