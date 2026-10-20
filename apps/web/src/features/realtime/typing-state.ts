export const TYPING_INTERVAL_MS = 3000;
export const TYPING_TTL_MS = 5000;
export type TypingState = Record<string, Record<string, number>>;

export function addTyping(
  state: TypingState,
  channelId: string,
  userId: string,
  now: number,
): TypingState {
  return { ...state, [channelId]: { ...state[channelId], [userId]: now + TYPING_TTL_MS } };
}

export function expireTyping(state: TypingState, now: number): TypingState {
  const entries = Object.entries(state).flatMap(([channel, users]) => {
    const active = Object.fromEntries(Object.entries(users).filter(([, expires]) => expires > now));
    return Object.keys(active).length ? [[channel, active] as const] : [];
  });
  return Object.fromEntries(entries);
}
