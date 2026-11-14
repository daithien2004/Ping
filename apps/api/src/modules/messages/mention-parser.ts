import { Limits } from '@ping/shared';

// Token dài hơn 32 ký tự không match một phần; phần vượt `Limits.MENTIONS_PER_MESSAGE` bị bỏ.
const MENTION_TOKEN = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_.-]{3,32})(?![A-Za-z0-9_.-])/g;

export interface MentionTokens {
  everyone: boolean;
  names: string[];
}

export function extractMentionTokens(
  content: string,
  limit: number = Limits.MENTIONS_PER_MESSAGE,
): MentionTokens {
  const seen = new Set<string>();
  const names: string[] = [];
  let everyone = false;

  for (const match of content.matchAll(MENTION_TOKEN)) {
    const token = match[1];
    if (token === undefined) continue;
    if (token === 'everyone') {
      if (!everyone) {
        everyone = true;
        seen.add('everyone');
      }
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    names.push(token);
    if (seen.size >= limit) break;
  }

  return { everyone, names };
}
