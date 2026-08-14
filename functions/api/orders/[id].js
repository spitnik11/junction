// GET /api/orders/:id — one order for its client or pro. Used by the Order view.
import { err, json } from '../../_lib/util.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const user = context.data.user;
  if (!user) return err('login required', 401);

  const o = await env.DB.prepare(
    `SELECT o.*, l.title AS title, c.name AS client_name, p.name AS pro_name
     FROM orders o
     JOIN listings l ON l.id = o.listing_id
     JOIN users c ON c.id = o.client_user_id
     JOIN users p ON p.id = o.pro_user_id
     WHERE o.id = ?`
  ).bind(params.id).first();

  if (!o) return err('order not found', 404);
  if (o.client_user_id !== user.id && o.pro_user_id !== user.id) return err('forbidden', 403);
  return json(o);
}
