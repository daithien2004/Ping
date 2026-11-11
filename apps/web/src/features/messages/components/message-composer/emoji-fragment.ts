export function extractFragment(draft: string): string | null {
  const match = /:([a-z0-9_]{1,32})$/.exec(draft);
  return match?.[1] ?? null;
}

export const replaceFragment = (draft: string, fragment: string, insert = ''): string =>
  draft.slice(0, draft.length - fragment.length - 1) + insert;
