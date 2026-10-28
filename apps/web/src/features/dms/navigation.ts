/**
 * Route DM (TG.9): route channel của server `/servers/:serverId/channels/:channelId` bắt buộc
 * có `serverId` trong URL — DM không thuộc server nào (ADR-0070: `Channel.serverId` null) nên
 * dùng route riêng `/dms/:channelId` ít xâm phạm nhất: không đụng route/AbilityProvider của
 * server, pane tin nhắn (`MessagePane`) vẫn tái dùng nguyên trạng qua chế độ `dm`.
 */
export const dmsPath = () => '/dms';

export const dmPath = (channelId: string) => `/dms/${channelId}`;

/** Permalink của một tin trong DM (TG.5 — mở cửa sổ quanh tin đích). */
export const dmMessagePath = (channelId: string, messageId: string) =>
  `/dms/${channelId}/messages/${messageId}`;
