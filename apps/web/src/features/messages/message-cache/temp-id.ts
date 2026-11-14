const PREFIX = 'temp-';

export const tempIdOf = (nonce: string) => `${PREFIX}${nonce}`;

export const isTempId = (id: string) => id.startsWith(PREFIX);
