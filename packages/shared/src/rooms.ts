// Hợp đồng tên room Socket.IO giữa API (phát) và Realtime (giữ kết nối). Đổi tên ở đây là đổi cho cả hai phía (ADR-0098).
export const userRoom = (userId: string) => `user:${userId}`;
export const serverRoom = (serverId: string) => `server:${serverId}`;
export const channelRoom = (channelId: string) => `channel:${channelId}`;
export const presenceRoom = (userId: string) => `presence:${userId}`;
