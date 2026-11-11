import type { MessageDto } from '@ping/shared';
import type { InfiniteData } from '@tanstack/react-query';

export type ClientMessage = MessageDto & {
  status?: 'sending' | 'failed';
  pendingAttachmentIds?: string[];
  gifId?: string;
};

export interface ClientMessagePage {
  messages: ClientMessage[];
  hasMore: boolean;
}

export interface MessagesWindow {
  aroundId: string;
  hasNewer: boolean;
}

export type MessagesCache = InfiniteData<ClientMessagePage, string | undefined> & {
  deletedIds?: string[];
  deletedNonces?: string[];
  window?: MessagesWindow;
};
