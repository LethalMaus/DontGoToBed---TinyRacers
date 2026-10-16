import { DurableObject } from 'cloudflare:workers';
import { ROOM, RESUME, MAX_HOST, roomForSecret, allowedRate, validInput } from './protocol.mjs';

const reject = (status, text) => new Response(text, { status, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['/host', '/input'].includes(url.pathname)) return env.ASSETS.fetch(request);
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return reject(426, 'WebSocket required');
    const token = url.searchParams.get('token');
    if (!ROOM.test(token ?? '')) return reject(400, 'Invalid room');
    if (url.pathname === '/host') {
      const secret = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (await roomForSecret(secret) !== token) return reject(403, 'Invalid host');
    } else {
      if (request.headers.get('Origin') !== url.origin) return reject(403, 'Invalid origin');
      const resume = url.searchParams.get('resume');
      if (resume !== null && !RESUME.test(resume)) return reject(400, 'Invalid resume');
    }
    return env.ROOMS.get(env.ROOMS.idFromName(token)).fetch(request);
  }
};

// One isolated room. The TV owns gameplay and validates controller commands.
// Hibernation avoids keeping idle rooms resident; never store gameplay or device data.
export class RaceRoom extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.ctx = ctx; }
  sockets(role) { return this.ctx.getWebSockets(role).filter(ws => ws.readyState === 1); }
  send(ws, data) { try { ws.send(JSON.stringify(data)); } catch { ws.close(1011, 'Reconnect'); } }
  async fetch(request) {
    const url = new URL(request.url), isHost = url.pathname === '/host';
    const hosts = this.sockets('host');
    if (isHost && hosts.length) return reject(409, 'Host already connected');
    if (!isHost && !hosts.length) return reject(404, 'TV is offline');
    if (!isHost && this.sockets('player').length >= 4) return reject(429, 'Room full');
    const [client, server] = Object.values(new WebSocketPair());
    const role = isHost ? 'host' : 'player', id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [role, id]);
    server.serializeAttachment({ role, id, window: Date.now(), count: 0 });
    if (isHost) {
      // Fixed maximum session lifetime, refreshed only when the TV establishes a new session.
      await this.ctx.storage.setAlarm(Date.now() + 4 * 60 * 60 * 1000);
      this.send(server, { type: 'connected' });
    } else this.send(hosts[0], { type: 'open', id, resume: url.searchParams.get('resume') });
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, data) {
    const state = ws.deserializeAttachment();
    if (!state || typeof data !== 'string' || data.length > (state.role === 'host' ? MAX_HOST : 512) ||
        !allowedRate(state, Date.now(), state.role === 'host' ? 300 : 60)) { ws.close(1008, 'Message limit'); return; }
    ws.serializeAttachment(state);
    if (state.role === 'player') {
      if (!validInput(data)) { ws.close(1008, 'Invalid input'); return; }
      const host = this.sockets('host')[0];
      if (host) this.send(host, { type: 'message', id: state.id, data });
      else ws.close(1012, 'TV reconnecting');
    } else {
      let message; try { message = JSON.parse(data); } catch { ws.close(1008, 'Invalid message'); return; }
      if (!RESUME.test(message.id ?? '') || !['message', 'close'].includes(message.type)) { ws.close(1008, 'Invalid envelope'); return; }
      const peer = this.sockets(message.id)[0];
      if (!peer || peer.deserializeAttachment()?.role !== 'player') return;
      if (message.type === 'close') peer.close(message.code === 1008 ? 1008 : 1012, 'TV closed connection');
      else if (typeof message.data === 'string' && message.data.length <= MAX_HOST) peer.send(message.data);
      else ws.close(1008, 'Invalid payload');
    }
  }
  webSocketClose(ws) { this.disconnected(ws); }
  webSocketError(ws) { this.disconnected(ws); }
  disconnected(ws) {
    const state = ws.deserializeAttachment();
    try { ws.close(1000, 'Closed'); } catch {}
    if (state?.role === 'host') {
      for (const peer of this.sockets('player')) peer.close(1012, 'TV reconnecting');
    }
    else if (state) { const host = this.sockets('host')[0]; if (host) this.send(host, { type: 'close', id: state.id }); }
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) try { ws.close(1012, 'Session expired; reconnect'); } catch {}
    await this.ctx.storage.deleteAll();
  }
}
