// Shared helpers for all Junction Pages Functions.
export const now = () => Math.floor(Date.now() / 1000);
export const genId = (p) => p + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', ...headers },
  });

export const err = (msg, status = 400) => json({ error: msg }, status);

export const FEE_BPS = 1000; // 10% platform fee
export const feeFor = (cents) => Math.round((cents * FEE_BPS) / 10000);
export const AUTO_RELEASE_SECONDS = 5 * 24 * 60 * 60; // 5-day auto-release
