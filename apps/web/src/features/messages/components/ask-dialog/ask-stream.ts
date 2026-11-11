const ERROR_KEYS = {
  AI_INSUFFICIENT_CONTEXT: 'ask.insufficient',
  AI_NO_CITATION: 'ask.noCitation',
  AI_UNAVAILABLE: 'ask.unavailable',
  AI_RETRIEVAL_FAILED: 'ask.retrievalFailed',
  AI_INVALID_QUESTION: 'ask.invalidQuestion',
  AI_QUOTA_EXCEEDED: 'ask.quotaExceeded',
  AI_BUDGET_EXHAUSTED: 'ask.budgetExhausted',
} as const;

export function askErrorKey(code: string | undefined) {
  return code && code in ERROR_KEYS ? ERROR_KEYS[code as keyof typeof ERROR_KEYS] : 'ask.error';
}

export interface AskEvent {
  type: string;
  data: Record<string, unknown>;
}

export function parseEvent(chunk: string): AskEvent | null {
  let type = 'message';
  const dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) type = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    const data: unknown = JSON.parse(dataLines.join('\n'));
    if (typeof data !== 'object' || data === null) return null;
    return { type, data: data as Record<string, unknown> };
  } catch {
    return null;
  }
}
