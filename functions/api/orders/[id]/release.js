// POST /api/orders/:id/release (buying client only) — delivered → released.
// Pays the pro via a Stripe Transfer of amount-fee from the platform balance
// (separate-transfers escrow). Claims the row atomically BEFORE transferring so
// concurrent calls can't double-pay; rolls the claim back if the transfer fails.
import { makeStripe } from '../../../_lib/stripe.js';
import { err, json, now } from '../../../_lib/util.js';

export async function onRequestPost(context) {
  const { env, params } = context;
  const user = context.data.user;
  if (!user) return err('login required', 401);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(params.id).first();
  if (!order) return err('order not found', 404);
  if (order.client_user_id !== user.id) return err('forbidden', 403);
  if (order.status !== 'delivered') return err('order not releasable', 409);

  const pro = await env.DB.prepare('SELECT stripe_account_id FROM pros WHERE user_id = ?')
    .bind(order.pro_user_id).first();
  if (!pro || !pro.stripe_account_id) return err('pro has no connected account', 409);

  // Double-release guard: flip delivered→released atomically; only the winner transfers.
  const claim = await env.DB.prepare(
    "UPDATE orders SET status='released', released_at=? WHERE id=? AND status='delivered'"
  ).bind(now(), params.id).run();
  if (!claim.meta.changes) return err('already released', 409);

  try {
    const transfer = await makeStripe(env).transfers.create({
      amount: order.amount_cents - order.fee_cents,
      currency: 'usd',
      destination: pro.stripe_account_id,
      transfer_group: order.id,
      metadata: { order_id: order.id },
    });
    await env.DB.prepare('UPDATE orders SET stripe_transfer_id=? WHERE id=?')
      .bind(transfer.id, order.id).run();
    return json({ ok: true, status: 'released', transfer_id: transfer.id });
  } catch (e) {
    // Transfer failed — undo the claim so a retry can succeed instead of leaving
    // the order 'released' with no payout.
    await env.DB.prepare(
      "UPDATE orders SET status='delivered', released_at=NULL WHERE id=? AND status='released'"
    ).bind(order.id).run();
    return err('transfer failed: ' + e.message, 502);
  }
}
