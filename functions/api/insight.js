// GET /api/insight — admin-gated. Summarizes live marketplace data via Workers AI
// (free tier). Honesty: if there are no orders, it says so and won't invent conversions.
import { json, err } from '../_lib/util.js';

export async function onRequestGet({ env, request }) {
  const token = request.headers.get('x-admin-token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return err('admin only', 401);

  const cats = (await env.DB.prepare(
    `SELECT category, COUNT(*) AS listings, CAST(AVG(price_cents) AS INT) AS avg_price_cents
     FROM listings WHERE active=1 GROUP BY category ORDER BY listings DESC`).all()).results || [];
  const byStatus = (await env.DB.prepare(
    `SELECT status, COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS gmv_cents FROM orders GROUP BY status`).all()).results || [];
  const top = (await env.DB.prepare(
    `SELECT l.title, l.category, l.price_cents, COUNT(o.id) AS orders
     FROM listings l LEFT JOIN orders o ON o.listing_id = l.id
     WHERE l.active=1 GROUP BY l.id ORDER BY orders DESC, l.created_at DESC LIMIT 8`).all()).results || [];

  const total_orders = byStatus.reduce((s, r) => s + r.n, 0);
  const data = { categories: cats, orders_by_status: byStatus, top_listings: top, total_orders };

  const user = `Marketplace data (JSON):\n${JSON.stringify(data)}\n\n` +
    `Write 3-5 short "- " bullets: which categories/listings are converting, and one concrete ` +
    `suggestion to grow take-rate revenue. If total_orders is 0, state there are no completed ` +
    `orders yet and comment only on the catalog (categories, pricing) — do not invent conversions.`;

  try {
    const r = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: 'You are a concise marketplace analyst. Output only plain-text bullets starting with "- ". No preamble, no headings.' },
        { role: 'user', content: user },
      ],
      max_tokens: 400,
    });
    return json({ summary: String((r && (r.response ?? r.result)) || '').trim(), total_orders });
  } catch (e) {
    return json({ summary: '', error: 'AI unavailable: ' + e.message, total_orders });
  }
}
