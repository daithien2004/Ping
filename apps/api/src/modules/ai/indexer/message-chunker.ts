/**
 * Ghép cửa sổ tin nhắn liền kề thành một chunk hội thoại cho embedding.
 *
 * Cửa sổ neo vào tin mới nhất (tin kích hoạt): lấy tối đa `windowSize` tin
 * cùng channel, đi ngược về trước, dừng khi vượt `maxTokens`. Nhờ vậy point id
 * luôn là id tin neo — upsert lại cùng một point là idempotent.
 */
export interface ChunkMessage {
  id: string;
  author: string;
  content: string;
}

export interface ConversationChunk {
  text: string;
  messageIds: string[];
}

/**
 * Ước lượng token không phụ thuộc tokenizer: tiếng Việt thường ~3 ký tự/token.
 * Đây là giới hạn mềm để chunk không phình quá cửa sổ model; số đo thật nằm ở
 * T5.1 (độ trễ embed theo batch).
 */
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

  // Đi từ tin neo (cuối mảng) ngược về trước để tin mới luôn có mặt.
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
