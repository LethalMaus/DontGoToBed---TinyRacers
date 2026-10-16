export const ROOM = /^[0-9a-f]{32}$/;
export const RESUME = /^[0-9a-f-]{36}$/;
export const MAX_INPUT = 512;
export const MAX_HOST = 32768;
export async function roomForSecret(secret) {
  if (!/^[0-9a-f]{64}$/.test(secret ?? '')) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export function allowedRate(state, now, limit) {
  if (now - state.window >= 1000) { state.window = now; state.count = 0; }
  return ++state.count <= limit;
}
export function validInput(data) {
  if (typeof data !== 'string' || new TextEncoder().encode(data).length > MAX_INPUT) return false;
  try { const message = JSON.parse(data); return message.v === 1 && typeof message.type === 'string'; }
  catch { return false; }
}
