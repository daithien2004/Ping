// Engine.IO v4 + Socket.IO v5 tối thiểu trên WebSocket của k6: "0{...}" mở, "40{auth}" vào namespace,
// "2"/"3" ping/pong, "42[event,payload]" sự kiện ("42<id>" cần ack, "43<id>" là ack).
import { WebSocket } from 'k6/websockets';

/** handlers: { onOpen(client), onEvent(name, payload), onClose(), onError(message) }; client.emit(name, payload, ack?), client.close() */
export function connect(baseUrl, token, forwardedFor, handlers) {
  const url = `${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
  const ws = new WebSocket(url, null, { headers: { 'X-Forwarded-For': forwardedFor } });
  let nextAck = 1;
  const acks = new Map();
  const client = {
    emit(name, payload, onAck) {
      if (onAck) {
        const id = nextAck++;
        acks.set(id, onAck);
        ws.send(`42${id}${JSON.stringify([name, payload])}`);
      } else {
        ws.send(`42${JSON.stringify([name, payload])}`);
      }
    },
    close() {
      ws.close();
    },
  };

  ws.onmessage = (message) => {
    const data = message.data;
    if (typeof data !== 'string' || data.length === 0) return;
    if (data[0] === '0') {
      ws.send(`40${JSON.stringify({ token })}`);
    } else if (data[0] === '2') {
      ws.send('3');
    } else if (data.startsWith('40')) {
      handlers.onOpen?.(client);
    } else if (data.startsWith('44')) {
      handlers.onError?.(data.slice(2));
    } else if (data.startsWith('43')) {
      const bracket = data.indexOf('[');
      const id = Number(data.slice(2, bracket));
      const callback = acks.get(id);
      if (callback) {
        acks.delete(id);
        callback(JSON.parse(data.slice(bracket))[0]);
      }
    } else if (data.startsWith('42')) {
      const [name, payload] = JSON.parse(data.slice(2));
      handlers.onEvent?.(name, payload);
    }
  };
  ws.onerror = (event) => handlers.onError?.(event.error ?? 'ws error');
  ws.onclose = () => handlers.onClose?.();
  return client;
}
