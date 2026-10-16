// Small test-only WebSocket client. Production uses the browser WebSocket API.
import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash } from 'node:crypto';

export async function waitFor(predicate, label, timeout = 4000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const result = predicate(); if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error(`Timed out: ${label}`);
}
export async function connectWire(origin, token, { ca, requestOrigin = origin, resume } = {}) {
  const url = new URL(`/input?token=${token}`, origin);
  if (resume) url.searchParams.set('resume', resume);
  const key = randomBytes(16).toString('base64');
  const request = (url.protocol === 'https:' ? https : http).request(url, {
    ca, headers: { Origin: requestOrigin, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key },
  });
  const connection = new Promise((resolve, reject) => {
    request.on('error', reject);
    request.on('response', response => { response.resume(); reject(Error(`HTTP ${response.statusCode}`)); });
    request.on('upgrade', (response, socket, head) => {
      const expected = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if (response.headers['sec-websocket-accept'] !== expected) { socket.destroy(); reject(Error('Invalid upgrade')); return; }
      const client = { messages: [], closed: false, closeCode: null, error: null, socket };
      let buffered = Buffer.alloc(0);
      client.send = (value, opcode = 1) => {
        const data = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
        if (data.length > 65535) throw Error('Test client payload too large');
        const mask = randomBytes(4), extended = data.length >= 126;
        const header = Buffer.alloc(extended ? 8 : 6);
        header[0] = 0x80 | opcode; header[1] = 0x80 | (extended ? 126 : data.length);
        if (extended) header.writeUInt16BE(data.length, 2);
        mask.copy(header, extended ? 4 : 2);
        const payload = Buffer.from(data);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        socket.write(Buffer.concat([header, payload]));
      };
      const consume = chunk => {
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length >= 2) {
          const opcode = buffered[0] & 15; let length = buffered[1] & 127; let start = 2;
          if (length === 126) { if (buffered.length < 4) return; length = buffered.readUInt16BE(2); start = 4; }
          if (length === 127 || buffered[1] & 128) { client.error = 'Unexpected test frame'; socket.destroy(); return; }
          if (buffered.length < start + length) return;
          const payload = buffered.subarray(start, start + length); buffered = buffered.subarray(start + length);
          if (opcode === 1) { try { client.messages.push(JSON.parse(payload.toString())); } catch { client.error = 'Non-JSON host response'; } }
          else if (opcode === 8) { client.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005; socket.end(); }
          else if (opcode === 9) client.send(payload.toString(), 10);
        }
      };
      socket.on('data', consume); socket.on('close', () => { client.closed = true; });
      socket.on('error', error => { client.error = error.message; });
      client.close = async () => { socket.destroy(); await waitFor(() => client.closed, 'socket close'); };
      client.ping = async id => {
        const start = performance.now(); client.send({ v: 1, type: 'ping', id });
        const pong = await waitFor(() => client.messages.find(message => message.type === 'pong' && message.id === id), 'pong');
        return { ...pong, rttMs: performance.now() - start };
      };
      if (head.length) consume(head); resolve(client);
    });
  });
  request.setTimeout(4000, () => request.destroy(Error('Upgrade timed out'))); request.end();
  return connection;
}
