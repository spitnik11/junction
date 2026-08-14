// Minimal signed-cookie session (Web Crypto HMAC). No PII beyond the user id in the cookie.
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function signSession(uid, secret) {
  return uid + '.' + (await hmac(secret, uid));
}

export async function readSession(cookieHeader, secret) {
  const m = /(?:^|;\s*)jsid=([^;]+)/.exec(cookieHeader || '');
  if (!m) return null;
  const val = decodeURIComponent(m[1]);
  const i = val.lastIndexOf('.');
  if (i < 0) return null;
  const uid = val.slice(0, i), sig = val.slice(i + 1);
  const good = await hmac(secret, uid);
  if (sig.length !== good.length) return null;
  let d = 0;
  for (let k = 0; k < sig.length; k++) d |= sig.charCodeAt(k) ^ good.charCodeAt(k);
  return d === 0 ? uid : null;
}

export function setCookie(session) {
  return `jsid=${encodeURIComponent(session)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
}

// Returns the current user row (or null). Reads context.env.SESSION_SECRET + DB.
export async function currentUser(context) {
  const uid = await readSession(context.request.headers.get('Cookie'), context.env.SESSION_SECRET);
  if (!uid) return null;
  return await context.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
}
