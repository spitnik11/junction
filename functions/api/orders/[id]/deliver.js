// POST /api/orders/:id/deliver (pro only, must own the order) — held → delivered,
// stamp delivered_at + auto_release_at (now + 5 days).
import { err, json, now, AUTO_RELEASE_SECONDS } from '../../../_lib/util.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const user = context.data.user;
  if (!user || user.role !== 'pro') return err('pro only', 403);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(params.id).first();
  if (!order) return err('order not found', 404);
  if (order.pro_user_id !== user.id) return err('forbidden', 403);
  if (order.status !== 'held') return err('order not in held state', 409);

  const t = now();
  await env.DB.prepare(
    "UPDATE orders SET status='delivered', delivered_at=?, auto_release_at=? WHERE id=? AND status='held'"
  ).bind(t, t + AUTO_RELEASE_SECONDS, params.id).run();

  return json({ ok: true, status: 'delivered', auto_release_at: t + AUTO_RELEASE_SECONDS });
}
