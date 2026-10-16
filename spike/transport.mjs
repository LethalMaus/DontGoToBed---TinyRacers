// Same-origin transport: hosted relay or local development bridge.
export class EmulatorTransport {
  constructor(status, lobby = () => {}) {
    this.status = status; this.socket = null; this.timer = null; this.wanted = false;
    this.attempts = 0; this.connections = 0; this.sent = 0; this.sequence = 0;
    this.rtts = []; this.pending = new Map(); this.ready = false; this.syntheticUsed = false;
    this.lastPing = 0;
    this.host = null;
    this.lobby = lobby; this.playerId = null; this.resume = null;
  }
  connect(token) {
    this.stop(); this.token = token; this.resume = null;
    try { this.resume = sessionStorage.getItem(`tiny-racers-player-${token}`); } catch {}
    this.wanted = true; this.open();
  }
  open() {
    if (!this.wanted) return;
    this.attempts++; this.status('Connecting…'); this.ready = false; this.host = null;
    const endpoint = new URL('/input', location.href);
    endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    endpoint.searchParams.set('token', this.token);
    if (/^[0-9a-f-]{36}$/.test(this.resume ?? '')) endpoint.searchParams.set('resume', this.resume);
    const socket = new WebSocket(endpoint.href);
    this.socket = socket;
    const deadline = setTimeout(() => { if (!this.ready) socket.close(); }, 3000);
    socket.onmessage = event => {
      if (socket !== this.socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message.v !== 1) return;
        if (message.type === 'welcome') {
          clearTimeout(deadline); this.ready = true; this.sequence = 0; this.connections++;
          this.playerId = message.playerId; this.resume = message.resume;
          try { sessionStorage.setItem(`tiny-racers-player-${this.token}`, this.resume); } catch {}
          this.status(`Connected · Player ${this.playerId}`);
        } else if (message.type === 'lobby') {
          this.lobby(message, this.playerId);
        } else if (message.type === 'pong' && this.pending.has(message.id)) {
          this.host = message.host ?? null;
          this.rtts.push(performance.now() - this.pending.get(message.id)); this.pending.delete(message.id);
          if (this.rtts.length > 300) this.rtts.shift();
        }
      } catch { this.status('Invalid host response'); socket.close(); }
    };
    socket.onerror = () => { if (socket === this.socket) this.status('Connection failed; check forwarding and TV token.'); };
    socket.onclose = event => {
      clearTimeout(deadline);
      if (socket !== this.socket) return;
      this.ready = false; this.pending.clear(); this.host = null;
      this.lobby(null, this.playerId);
      if (event.code === 1008) { this.wanted = false; this.status(`Host rejected connection: ${event.reason}`); }
      else if (this.wanted) { this.status('Disconnected; retrying in one second…'); this.timer = setTimeout(() => this.open(), 1000); }
    };
  }
  stop() {
    this.wanted = false; clearTimeout(this.timer); this.ready = false; this.pending.clear(); this.host = null;
    const old = this.socket; this.socket = null; old?.close(); this.status('Disconnected');
    this.lobby(null, this.playerId);
  }
  setReady(ready) {
    if (this.ready) this.socket.send(JSON.stringify({ v: 1, type: 'ready', ready }));
  }
  setAutoItems(enabled) {
    if(this.ready)this.socket.send(JSON.stringify({v:1,type:"autoItems",enabled}));
  }
  chooseLanguage(language) {
    if(this.ready)this.socket.send(JSON.stringify({v:1,type:"language",language}));
  }
  chooseLaps(laps) {
    if(this.ready)this.socket.send(JSON.stringify({v:1,type:"laps",laps}));
  }
  chooseBots(bots) {
    if(this.ready)this.socket.send(JSON.stringify({v:1,type:'bots',bots}));
  }
  chooseTrack(track) {
    if(this.ready)this.socket.send(JSON.stringify({v:1,type:"track",track}));
  }
  chooseCharacter(character) {
    if (this.ready) this.socket.send(JSON.stringify({ v: 1, type: 'character', character }));
  }
  command(type) {
    if (this.ready && ['start', 'lobby', 'use', 'pause', 'resume'].includes(type)) this.socket.send(JSON.stringify({ v: 1, type }));
  }
  leave() {
    if (this.ready) this.socket.send(JSON.stringify({ v: 1, type: 'leave' }));
    try { sessionStorage.removeItem(`tiny-racers-player-${this.token}`); } catch {}
    this.resume = null; this.playerId = null; this.stop();
  }
  sendInput(value, synthetic, active = true) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 1024) { this.socket.close(); return; }
    if (!Number.isFinite(value) || Math.abs(value) > 1) return;
    const now = performance.now();
    // Application heartbeat detects half-open links even if the OS has not noticed.
    for (const time of this.pending.values()) if (now - time > 3000) { this.socket.close(); return; }
    this.socket.send(JSON.stringify({ v: 1, type: 'input', seq: this.sequence++, steering: value, synthetic: !!synthetic, active: !!active }));
    this.sent++; this.syntheticUsed ||= synthetic;
    if (now - this.lastPing >= 1000) {
      const id = this.sent; this.pending.set(id, now); this.lastPing = now;
      this.socket.send(JSON.stringify({ v: 1, type: 'ping', id }));
    }
  }
  metrics() {
    const sorted = [...this.rtts].sort((a,b) => a-b);
    return {
      attempts: this.attempts, successfulConnections: this.connections, sent: this.sent,
      connected: this.ready, syntheticInputUsed: this.syntheticUsed,
      echoRttP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
      rttSamples: sorted.length, targetInputHz: 25,
      host: this.host,
      playerId: this.playerId,
      path: location.hostname.endsWith('.workers.dev') ? 'HTTPS/WSS → Cloudflare relay → TV' : `${location.hostname.endsWith('.trycloudflare.com') ? 'HTTPS/WSS internet tunnel' : location.protocol === 'https:' ? 'HTTPS/WSS LAN' : 'localhost'} → Mac bridge → ADB → TV emulator`,
      note: 'Network round-trip time; not physical motion-to-screen latency.',
    };
  }
}
