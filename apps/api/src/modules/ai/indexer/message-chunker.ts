export interface ChunkMessage {
  id: string;
  author: string;
  content: string;
}

export interface ConversationChunk {
  text: string;
  messageIds: string[];
}

// Ước lượng ~3 ký tự/token (tiếng Việt), giới hạn mềm.
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

export function buildConversationChunk(
  messages: readonly ChunkMessage[],
  maxTokens: number,
): ConversationChunk {
  if (messages.length === 0) {
    return { text: '', messageIds: [] };
  }

  const selected: ChunkMessage[] = [];
  let tokens = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const cost = estimateTokens(formatLine(message)) + 1;
    // Luôn giữ tin neo dù một mình nó đã vượt giới hạn.
    if (selected.length > 0 && tokens + cost > maxTokens) break;
    selected.unshift(message);
    tokens += cost;
  }

  return {
    text: selected.map(formatLine).join('\n'),
    messageIds: selected.map((message) => message.id),
  };
}

function formatLine(message: ChunkMessage): string {
  return `${message.author}: ${message.content}`;
}
