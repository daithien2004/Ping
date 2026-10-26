-- Support the self-referencing FK ON DELETE SET NULL. Without this index, deleting each
-- message scans the entire Message table to find replies, even when there are none.
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
