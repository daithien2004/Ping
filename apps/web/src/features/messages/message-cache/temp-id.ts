const PREFIX = 'temp-';

/** Id của tin tạm (chưa có id thật từ server), dựng từ nonce của lần gửi. */
export const tempIdOf = (nonce: string) => `${PREFIX}${nonce}`;

export const isTempId = (id: string) => id.startsWith(PREFIX);
