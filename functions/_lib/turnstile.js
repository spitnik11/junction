// Server-side Turnstile siteverify. Fails CLOSED in production; no-ops when
// TURNSTILE_SECRET is unset (local dev/tests) so those don't need a widget.
export async function verifyTurnstile(env, token, clientIp, expectedAction) {
  if (!env.TURNSTILE_SECRET) return true; // not configured → skip (dev)
  if (typeof token !== 'string' || !token || token.length > 2048) return false;

  const allow = new Set(
    (env.TURNSTILE_HOSTNAMES || '').split(',').map((h) => h.trim()).filter(Boolean)
  );

  let r;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp || '' }),
    });
    if (!resp.ok) return false;
    r = await resp.json();
  } catch {
    return false;
  }
  if (!r.success) return false;
  if (expectedAction && r.action !== expectedAction) return false;
  if (allow.size && !allow.has(r.hostname)) return false;
  return true;
}
