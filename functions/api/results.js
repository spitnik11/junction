// GET /api/results — admin metrics. Gated by ADMIN_TOKEN (default-deny) since it
// exposes GMV/revenue and order rows with names. Send header: x-admin-token.
import { json, err } from '../_lib/util.js';

export async function onRequestGet({ env, request }) {
  const token = request.headers.get('x-admin-token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return err('admin only', 401);

  const m = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('held','delivered','released') THEN amount_cents END),0) AS gmv_cents,
       COALESCE(SUM(CASE WHEN status = 'released'                       THEN fee_cents    END),0) AS revenue_cents,
       COALESCE(SUM(CASE WHEN status IN ('held','delivered')            THEN 1            END),0) AS active_orders,
       COALESCE(SUM(CASE WHEN status = 'held'                           THEN 1            END),0) AS in_escrow
     FROM orders`
  ).first();

  const { results: orders } = await env.DB.prepare(
    `SELECT o.*, c.name AS client_name, p.name AS pro_name
     FROM orders o
     JOIN users c ON c.id = o.client_user_id
     JOIN users p ON p.id = o.pro_user_id
     ORDER BY o.created_at DESC LIMIT 20`
  ).all();

  return json({ ...m, orders });
}
