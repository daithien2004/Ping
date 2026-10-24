-- CreateTable
CREATE TABLE "ChannelReadState" (
    "memberId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "lastReadMessageId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("memberId","channelId")
);

-- CreateTable
CREATE TABLE "MessageMention" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "mentionedMemberId" UUID,
    "kind" TEXT NOT NULL,
    "roleId" UUID,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelReadState_memberId_idx" ON "ChannelReadState"("memberId");

-- CreateIndex
CREATE INDEX "MessageMention_mentionedMemberId_messageId_idx" ON "MessageMention"("mentionedMemberId", "messageId" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MessageMention_messageId_kind_mentionedMemberId_roleId_key" ON "MessageMention"("messageId", "kind", "mentionedMemberId", "roleId");

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_mentionedMemberId_fkey" FOREIGN KEY ("mentionedMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
